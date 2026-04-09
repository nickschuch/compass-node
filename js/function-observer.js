'use strict';

// Function-level timing observer.
//
// Intercepts module exports and wraps exported functions with
// nanosecond-precision timing. Fires USDT probes when a function's
// execution time exceeds the configured threshold (default: 1ms).
// This mirrors the PHP extension's function_observer.rs.
//
// Two hooking mechanisms are used:
//
//   1. import-in-the-middle (ESM) — intercepts ES module imports via the
//      ESM loader hooks registered in index.mjs / hooks.mjs.
//
//   2. Module._load monkey-patch (CJS) — intercepts CommonJS require() calls.
//      This is necessary because import-in-the-middle explicitly does NOT
//      handle modules loaded via require().
//      See: https://github.com/nodejs/import-in-the-middle#limitations

const Module = require('node:module');
const { requestContext } = require('./http-observer.js');

// Module name patterns to exclude from wrapping.
// Built-in modules are instrumented via diagnostics_channel instead.
// Wrapping internal Node.js modules would add overhead without benefit.
const EXCLUDE_PATTERNS = [
    /^node:/,
    /import-in-the-middle/,
    /compass-node/,
    /\/compass\/node\//,
];

// Additional patterns for CJS modules (resolved to absolute file paths).
const CJS_EXCLUDE_PATTERNS = [
    /[/\\]node_modules[/\\]import-in-the-middle[/\\]/,
    /[/\\]compass-node[/\\]/,
    /[/\\]compass[/\\]node[/\\]/,
];

/**
 * Determines whether a module should be instrumented.
 * @param {string} name - The module specifier / path.
 * @returns {boolean}
 */
function shouldInstrument(name) {
    if (!name) return false;
    for (const pattern of EXCLUDE_PATTERNS) {
        if (pattern.test(name)) return false;
    }
    return true;
}

/**
 * Determines whether a CJS module should be instrumented.
 * CJS module names are request strings passed to require(), which may be
 * relative paths, absolute paths, or bare specifiers.
 *
 * @param {string} request - The require() request string.
 * @param {string} filename - The resolved absolute filename.
 * @returns {boolean}
 */
function shouldInstrumentCjs(request, filename) {
    if (!request) return false;

    // Skip Node.js built-in modules.
    if (request.startsWith('node:') || Module.builtinModules.includes(request)) {
        return false;
    }

    // Check the request string against standard exclude patterns.
    for (const pattern of EXCLUDE_PATTERNS) {
        if (pattern.test(request)) return false;
    }

    // Check the resolved filename against CJS-specific exclude patterns.
    if (filename) {
        for (const pattern of CJS_EXCLUDE_PATTERNS) {
            if (pattern.test(filename)) return false;
        }
    }

    return true;
}

/**
 * Initialize the function observer.
 *
 * Registers both ESM (import-in-the-middle) and CJS (Module._load) hooks
 * to wrap exported functions from all loaded modules with timing code.
 * Functions that execute faster than the threshold are not reported.
 *
 * @param {Object} addon - The native compass addon.
 * @param {{ isEnabled: () => boolean }} canary - Canary checker.
 * @param {bigint} threshold - Function time threshold in nanoseconds.
 */
function initFunctionObserver(addon, canary, threshold) {
    // Hook 1: ESM modules via import-in-the-middle.
    initEsmHook(addon, canary, threshold);

    // Hook 2: CJS modules via Module._load monkey-patch.
    initCjsHook(addon, canary, threshold);
}

/**
 * Register the import-in-the-middle Hook for ESM module interception.
 */
function initEsmHook(addon, canary, threshold) {
    let Hook;
    try {
        ({ Hook } = require('import-in-the-middle'));
    } catch {
        // import-in-the-middle not available — ESM function-level probes disabled.
        return;
    }

    Hook((exported, name, baseDir) => {
        if (!shouldInstrument(name)) return;

        const moduleName = formatModuleName(name, baseDir);
        wrapExports(exported, moduleName, addon, canary, threshold);
    });
}

/**
 * Monkey-patch Module._load to intercept CJS require() calls.
 *
 * This is the standard approach used by APM tools (e.g. require-in-the-middle,
 * OpenTelemetry, Datadog) to instrument CJS modules. We patch Module._load
 * rather than Module._compile because _load gives us access to the final
 * module.exports object after the module has been fully evaluated.
 */
function initCjsHook(addon, canary, threshold) {
    const originalLoad = Module._load;

    // Track modules we've already wrapped to avoid double-wrapping.
    // This is important because require() caches modules and _load is
    // called on every require(), but returns the cached exports.
    const wrappedModules = new Set();

    Module._load = function compassLoad(request, parent, isMain) {
        const exports = originalLoad.apply(this, arguments);

        // Fast rejection: skip built-in modules and known exclusions
        // before doing any expensive resolution.
        if (!request || request.startsWith('node:') || Module.builtinModules.includes(request)) {
            return exports;
        }

        // Resolve the filename for accurate path matching and dedup tracking.
        let filename = '';
        try {
            filename = Module._resolveFilename(request, parent, isMain);
        } catch {
            // Resolution can fail for edge cases — skip instrumentation.
            return exports;
        }

        if (!shouldInstrumentCjs(request, filename)) {
            return exports;
        }

        // Skip if we've already wrapped this module's exports.
        if (wrappedModules.has(filename)) {
            return exports;
        }

        // Only wrap plain objects (module.exports = { ... }) with
        // function properties. Skip primitives and null.
        if (exports === null || typeof exports !== 'object') {
            return exports;
        }

        wrappedModules.add(filename);

        const moduleName = formatModuleName(filename, '');
        wrapExports(exports, moduleName, addon, canary, threshold);

        return exports;
    };
}

/**
 * Wrap all function exports of a module with timing instrumentation.
 *
 * @param {Object} exported - The module's exports object.
 * @param {string} moduleName - Formatted module name for probe output.
 * @param {Object} addon - The native compass addon.
 * @param {{ isEnabled: () => boolean }} canary - Canary checker.
 * @param {bigint} threshold - Threshold in nanoseconds.
 */
function wrapExports(exported, moduleName, addon, canary, threshold) {
    const descriptors = Object.getOwnPropertyDescriptors(exported);
    for (const key of Object.keys(descriptors)) {
        const desc = descriptors[key];

        // Skip accessor properties (getters/setters) — accessing them
        // would invoke the getter with the wrong `this` context, and
        // they represent computed properties rather than callable exports.
        if (desc.get || desc.set) continue;

        const original = desc.value;

        if (typeof original !== 'function') continue;

        const fnName = `${moduleName}.${key}`;

        exported[key] = createWrapper(original, fnName, addon, canary, threshold);
    }
}

/**
 * Creates a timing wrapper around a function using a Proxy.
 *
 * Uses a Proxy with an `apply` trap instead of a replacement function to
 * transparently preserve all static properties, prototype chains, and
 * construction behaviour. This is critical because wrapExports() mutates
 * module exports objects in-place, and some packages (e.g. safe-buffer)
 * re-export built-in module objects by reference. A plain wrapper function
 * would strip static methods like Buffer.from / Buffer.alloc, corrupting
 * the shared built-in exports and crashing modules that depend on them.
 *
 * Measures wall-clock time for both synchronous and asynchronous functions.
 * For sync functions, time is measured from call to return. For functions
 * that return a thenable (async functions, Promise-returning functions),
 * time is measured from call to Promise settlement. This captures the
 * real cost of async I/O operations (HTTP calls, DB queries, timers, etc.)
 * which in PHP would be synchronous blocking calls measured by wall-clock
 * time in the function_observer.
 *
 * @param {Function} original - The original function.
 * @param {string} fnName - Fully-qualified function name for the probe.
 * @param {Object} addon - The native compass addon.
 * @param {{ isEnabled: () => boolean }} canary - Canary checker.
 * @param {bigint} threshold - Threshold in nanoseconds.
 * @returns {Function} The proxied function.
 */
function createWrapper(original, fnName, addon, canary, threshold) {
    return new Proxy(original, {
        apply(target, thisArg, args) {
            // Fast path: if no tracer is attached, call the original directly.
            if (!canary.isEnabled()) {
                return Reflect.apply(target, thisArg, args);
            }

            const startTime = process.hrtime.bigint();
            let result;
            try {
                result = Reflect.apply(target, thisArg, args);
            } catch (err) {
                reportIfSlow(startTime, fnName, addon, threshold);
                throw err;
            }

            // If the function returned a thenable (async function or
            // Promise-returning), measure the full async duration until
            // settlement. This captures the real cost of async I/O
            // (HTTP calls, DB queries, timers, etc.) which in PHP would
            // be synchronous blocking calls.
            if (result != null && typeof result.then === 'function') {
                return result.then(
                    (value) => { reportIfSlow(startTime, fnName, addon, threshold); return value; },
                    (err)   => { reportIfSlow(startTime, fnName, addon, threshold); throw err; },
                );
            }

            reportIfSlow(startTime, fnName, addon, threshold);
            return result;
        },
    });
}

/**
 * Reports a slow function via USDT probe if it exceeded the threshold.
 *
 * @param {bigint} startTime - When the function started (from process.hrtime.bigint()).
 * @param {string} fnName - Fully-qualified function name.
 * @param {Object} addon - The native compass addon.
 * @param {bigint} threshold - Threshold in nanoseconds.
 */
function reportIfSlow(startTime, fnName, addon, threshold) {
    const elapsed = process.hrtime.bigint() - startTime;
    if (elapsed <= threshold) return;

    const elapsedNum = Number(elapsed);
    // process.memoryUsage.rss() is the fast path (Node.js 19.6+).
    // Falls back to process.memoryUsage().rss for older versions.
    const memoryRss = typeof process.memoryUsage.rss === 'function'
        ? process.memoryUsage.rss()
        : process.memoryUsage().rss;

    // Determine context: HTTP request or CLI.
    const ctx = requestContext.getStore();
    if (ctx && ctx.requestId) {
        addon.httpFunction(ctx.requestId, fnName, elapsedNum, memoryRss);
    } else {
        addon.cliFunction(process.pid, fnName, elapsedNum, memoryRss);
    }
}

/**
 * Formats a module name for display in probes.
 * Strips common path prefixes to keep names readable.
 *
 * @param {string} name - Module specifier or path.
 * @param {string} baseDir - Base directory of the module.
 * @returns {string} Formatted module name.
 */
function formatModuleName(name, baseDir) {
    if (!name) return '<unknown>';

    // For node_modules packages, extract the package name.
    const nmIndex = name.lastIndexOf('node_modules/');
    if (nmIndex !== -1) {
        return name.slice(nmIndex + 'node_modules/'.length);
    }

    // For relative paths, strip the base directory.
    if (baseDir && name.startsWith(baseDir)) {
        return name.slice(baseDir.length).replace(/^\//, '');
    }

    // For file:// URLs, extract the path.
    if (name.startsWith('file://')) {
        try {
            name = new URL(name).pathname;
        } catch {
            return name;
        }
    }

    // For absolute paths (common with CJS _resolveFilename), strip to a
    // readable relative-like path. Use process.cwd() as the base.
    if (name.startsWith('/')) {
        const cwd = process.cwd();
        if (name.startsWith(cwd + '/')) {
            return name.slice(cwd.length + 1);
        }
    }

    return name;
}

module.exports = { initFunctionObserver };
