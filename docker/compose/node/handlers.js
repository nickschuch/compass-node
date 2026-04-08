// Request handlers extracted as module exports so that import-in-the-middle
// can intercept and wrap them with timing instrumentation.

const crypto = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');

/**
 * Simple health-check handler.
 */
async function handleRoot(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
}

/**
 * Simulate a slow request (50ms delay).
 */
async function handleSlow(req, res) {
    await sleep(50);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Slow response');
}

/**
 * Simulate CPU-intensive work.
 */
async function handleCpu(req, res) {
    const digest = computeHash();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Hash: ${digest}`);
}

/**
 * CPU-bound hash computation extracted as a separate export so it
 * can be independently timed by the function observer.
 */
function computeHash() {
    const hash = crypto.createHash('sha256');
    for (let i = 0; i < 10000; i++) {
        hash.update(`data-${i}`);
    }
    return hash.digest('hex');
}

/**
 * Simulate an error response.
 */
async function handleError(req, res) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
}

/**
 * 404 handler.
 */
async function handleNotFound(req, res) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
}

module.exports = {
    handleRoot,
    handleSlow,
    handleCpu,
    handleError,
    handleNotFound,
    computeHash,
};
