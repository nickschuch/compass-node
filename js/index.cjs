'use strict';

// CJS entrypoint for Compass Node.js extension.
// Loaded via: NODE_OPTIONS="--require /usr/lib/compass/node/js/index.cjs"
//
// This is a fallback for environments where --import is not available (Node.js < 20.6).
//
// Limitations when using --require instead of --import:
// - import-in-the-middle ESM hooks cannot be registered from CJS.
//   Function-level timing will only work for CJS modules (loaded via require()),
//   not for ESM modules (loaded via import).
// - HTTP lifecycle probes (diagnostics_channel) work for both CJS and ESM.
// - CLI process probes work for both CJS and ESM.

const path = require('node:path');
const config = require('./config.js');

if (!config.enabled) {
    // Compass is disabled — do nothing.
    return;
}

// Load the native addon.
let addon;
try {
    addon = require(path.join(__dirname, '..', 'compass.node'));
} catch (err) {
    console.warn(`[compass] Failed to load native addon: ${err.message}`);
    return;
}

// Initialize canary.
const { createCanary } = require('./canary.js');
const canary = createCanary(addon);

// Initialize function observer.
// The CJS hook (Module._load monkey-patch) works from both --require and --import
// entrypoints. ESM hooks are not available in CJS mode, but CJS module wrapping
// provides function-level timing for all require()'d modules.
const { initFunctionObserver } = require('./function-observer.js');
initFunctionObserver(addon, canary, config.functionThreshold);

// Initialize HTTP lifecycle observer.
const { initHttpObserver } = require('./http-observer.js');
initHttpObserver(addon, canary);

// Initialize CLI process lifecycle observer.
const { initProcessObserver } = require('./process-observer.js');
initProcessObserver(addon, canary);
