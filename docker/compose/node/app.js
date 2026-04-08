// Simple test HTTP server for Compass Node.js extension development.
// This server simulates various workloads to test probe instrumentation.
//
// Route handlers are in a separate module (handlers.js) so that
// import-in-the-middle can intercept their exports and wrap them
// with timing instrumentation for function-level USDT probes.

const http = require('node:http');
const {
    handleRoot,
    handleSlow,
    handleCpu,
    handleError,
    handleNotFound,
} = require('./handlers.js');

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    switch (url.pathname) {
        case '/':
            await handleRoot(req, res);
            break;

        case '/slow':
            await handleSlow(req, res);
            break;

        case '/cpu':
            await handleCpu(req, res);
            break;

        case '/error':
            await handleError(req, res);
            break;

        default:
            await handleNotFound(req, res);
            break;
    }
});

server.listen(PORT, () => {
    console.log(`Test server listening on port ${PORT}`);
});
