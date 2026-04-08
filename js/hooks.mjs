// ESM loader hooks for import-in-the-middle.
// This file is registered via module.register() from index.mjs and runs
// in the module loader thread. It enables interception of all ESM imports.
//
// Re-exports the hook.mjs from import-in-the-middle, which installs
// resolve + load hooks that wrap module exports with Proxy objects.

export * from 'import-in-the-middle/hook.mjs';
