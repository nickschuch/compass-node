'use strict';

// HTTP request lifecycle observer using diagnostics_channel.
// Subscribes to Node.js built-in HTTP diagnostic events to fire USDT probes
// for every HTTP request without any application code changes.
//
// Equivalent to the PHP extension's fpm.rs (init/shutdown probes).

const crypto = require('node:crypto');
const dc = require('node:diagnostics_channel');
const { AsyncLocalStorage } = require('node:async_hooks');

// AsyncLocalStorage for propagating request context to function-level probes.
// The function observer reads this to associate slow functions with the current request.
const requestContext = new AsyncLocalStorage();

// WeakMap to store per-request state (start time, request ID).
// Keyed on the request object to avoid memory leaks.
const requestState = new WeakMap();

/**
 * Initialize HTTP request lifecycle observation.
 *
 * @param {Object} addon - The native compass addon.
 * @param {{ isEnabled: () => boolean }} canary - Canary checker.
 */
function initHttpObserver(addon, canary) {
    // Subscribe to HTTP server request start.
    // diagnostics_channel.subscribe() is available since Node.js 18.
    // HTTP server channels are available since Node.js 18.19.0 / 20.6.0.
    if (typeof dc.subscribe === 'function') {
        safeSubscribe('http.server.request.start', (message) => {
            if (!canary.isEnabled()) return;

            const { request, response } = message;
            if (!request || !response) return;

            const requestId = getRequestId(request);
            const uri = request.url || '/unknown';
            const method = request.method || 'UNKNOWN';

            const startTime = process.hrtime.bigint();

            requestState.set(request, { requestId, startTime });

            // Enter async context so function-level probes can read the request ID.
            // We store the context on the response to propagate through async boundaries.
            const store = { requestId, startTime };
            requestContext.enterWith(store);

            addon.httpRequestInit(requestId, uri, method);
        });

        // Subscribe to HTTP server response finish.
        safeSubscribe('http.server.response.finish', (message) => {
            if (!canary.isEnabled()) return;

            const { request, response } = message;
            if (!request || !response) return;

            const state = requestState.get(request);
            if (!state) return;

            const durationNs = process.hrtime.bigint() - state.startTime;
            const statusCode = response.statusCode || 0;

            addon.httpRequestShutdown(
                state.requestId,
                Number(statusCode),
                Number(durationNs),
            );

            requestState.delete(request);
        });
    }
}

/**
 * Extract the request ID from the X-Request-ID header.
 * Generates a UUID if the header is not present so that init, function,
 * and shutdown probes can always be correlated for a given request.
 */
function getRequestId(request) {
    if (request.headers && request.headers['x-request-id']) {
        return request.headers['x-request-id'];
    }
    return crypto.randomUUID();
}

/**
 * Safely subscribe to a diagnostics_channel, ignoring errors if the channel
 * doesn't exist in this Node.js version.
 */
function safeSubscribe(channel, handler) {
    try {
        dc.subscribe(channel, handler);
    } catch {
        // Channel not available in this Node.js version — silently skip.
    }
}

module.exports = { initHttpObserver, requestContext };
