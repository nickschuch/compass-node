'use strict';

// Canary probe with 1-second TTL cache.
// Mirrors the PHP extension's canary.rs — a lightweight check to determine
// whether a tracer (bpftrace) is attached. All other probe logic is bypassed
// if the canary returns false.

const TTL_MS = 1000;

let cachedResult = false;
let lastCheckTime = 0;

/**
 * Initialize the canary module with the native addon.
 * @param {Object} addon - The native compass addon with a canary() function.
 * @returns {{ isEnabled: () => boolean }} Canary checker.
 */
function createCanary(addon) {
    function isEnabled() {
        const now = Date.now();
        if (now - lastCheckTime >= TTL_MS) {
            lastCheckTime = now;
            cachedResult = addon.canary();
        }
        return cachedResult;
    }

    return { isEnabled };
}

module.exports = { createCanary };
