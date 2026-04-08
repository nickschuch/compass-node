'use strict';

// Configuration read from environment variables.
// Mirrors the PHP extension's INI config (compass.enabled, compass.function_threshold).

const enabled = (() => {
    const val = process.env.COMPASS_ENABLED;
    if (val === undefined || val === '') return true;
    return val === 'true' || val === '1';
})();

// Function time threshold in nanoseconds.
// Only functions exceeding this threshold will fire probes.
// Default: 1,000,000 ns = 1 ms (matches the PHP extension default).
const functionThreshold = (() => {
    const val = process.env.COMPASS_FUNCTION_THRESHOLD;
    if (val === undefined || val === '') return 1_000_000n;
    const parsed = BigInt(val);
    return parsed > 0n ? parsed : 1_000_000n;
})();

module.exports = { enabled, functionThreshold };
