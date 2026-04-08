// Simple CLI test script for Compass Node.js extension development.
// Exercises the CLI probe path (cli_request_init, cli_function, cli_request_shutdown).
//
// Usage (inside the Docker container):
//   node /app/cli.js

const { computeHash } = require('./handlers.js');

console.log('Running CLI test...');

// Call an instrumented function a few times to trigger cli_function probes.
for (let i = 0; i < 3; i++) {
    const digest = computeHash();
    console.log(`Hash ${i + 1}: ${digest}`);
}

console.log('Done.');
