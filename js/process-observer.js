'use strict';

// CLI process lifecycle observer.
// Fires cli_request_init on startup and cli_request_shutdown on process exit.
//
// For HTTP server processes, the http-observer handles lifecycle probes instead.
// This module detects the runtime mode and only fires CLI probes when appropriate.
//
// Equivalent to the PHP extension's cli.rs (init/shutdown probes).

let isHttpServer = false;

/**
 * Mark the process as an HTTP server.
 * Called by the HTTP observer when it detects an HTTP server request.
 */
function markAsHttpServer() {
    isHttpServer = true;
}

/**
 * Initialize CLI process lifecycle observation.
 *
 * @param {Object} addon - The native compass addon.
 * @param {{ isEnabled: () => boolean }} canary - Canary checker.
 */
function initProcessObserver(addon, canary) {
    if (!canary.isEnabled()) return;

    const pid = process.pid;
    const command = process.argv.join(' ');

    // Fire CLI init probe immediately.
    // If this turns out to be an HTTP server, that's fine — the CLI probes
    // provide useful process lifecycle visibility either way.
    addon.cliRequestInit(pid, command);

    // Fire CLI shutdown probe on process exit.
    // The 'exit' event fires in all cases: clean exit, beforeExit,
    // SIGTERM, uncaught exceptions, and process.exit() calls.
    let shutdownFired = false;

    process.on('exit', () => {
        if (shutdownFired) return;
        shutdownFired = true;
        if (!canary.isEnabled()) return;
        addon.cliRequestShutdown(pid);
    });
}

module.exports = { initProcessObserver, markAsHttpServer };
