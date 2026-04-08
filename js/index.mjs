// ESM entrypoint for Compass Node.js extension.
// Loaded via: NODE_OPTIONS="--import /usr/lib/compass/node/js/index.mjs"
//
// This file orchestrates all instrumentation:
// 1. Reads configuration from environment variables
// 2. Loads the native addon (.node file with USDT probes)
// 3. Checks the canary probe to see if a tracer is attached
// 4. Registers import-in-the-middle ESM hooks for function-level timing
// 5. Initializes HTTP lifecycle observation via diagnostics_channel
// 6. Initializes CLI process lifecycle observation

import { register } from 'node:module';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use createRequire to load CJS modules from the ESM entrypoint.
const require = createRequire(import.meta.url);

// Step 1: Read configuration.
const config = require('./config.js');

if (!config.enabled) {
    // Compass is disabled — do nothing. Zero overhead.
    // This mirrors the PHP extension's early exit in on_module_init().
} else {
    // Step 2: Load the native addon.
    let addon;
    try {
        addon = require(join(__dirname, '..', 'compass.node'));
    } catch (err) {
        // Native addon not found or failed to load.
        // This can happen on platforms where the addon isn't installed (e.g. macOS dev).
        // Silently disable — don't break the application.
        console.warn(`[compass] Failed to load native addon: ${err.message}`);
        addon = null;
    }

    if (addon) {
        // Step 3: Initialize canary.
        const { createCanary } = require('./canary.js');
        const canary = createCanary(addon);

        // Step 4: Register import-in-the-middle ESM loader hooks.
        // This must happen before any application modules are imported.
        // The hooks.mjs file re-exports import-in-the-middle/hook.mjs which
        // installs resolve + load hooks in the module loader thread.
        try {
            register('./hooks.mjs', import.meta.url);
        } catch (err) {
            console.warn(`[compass] Failed to register ESM hooks: ${err.message}`);
        }

        // Step 5: Initialize function observer (import-in-the-middle Hook).
        const { initFunctionObserver } = require('./function-observer.js');
        initFunctionObserver(addon, canary, config.functionThreshold);

        // Step 6: Initialize HTTP lifecycle observer.
        const { initHttpObserver } = require('./http-observer.js');
        initHttpObserver(addon, canary);

        // Step 7: Initialize CLI process lifecycle observer.
        const { initProcessObserver } = require('./process-observer.js');
        initProcessObserver(addon, canary);
    }
}
