# compass-node

A native Node.js performance tracing extension for the [Skpr](https://github.com/skpr/skpr) platform.

Part of the Compass tracing system, this is the Node.js counterpart to the [PHP Compass extension](https://github.com/skpr/compass-php).

## How it works

The extension has three layers:

1. **Rust native addon** — Defines USDT probes using the `probe_lazy!` macro, compiled to a `.node` shared library via NAPI-RS.

2. **JavaScript instrumentation layer** — Loaded automatically via `NODE_OPTIONS=--import`. Hooks into Node.js `diagnostics_channel` for HTTP events, wraps ESM/CJS module exports for function-level timing, and uses a canary probe with a 1-second TTL cache to detect whether a tracer is attached before firing any probes.

3. **bpftrace scripts** — Ready-to-run scripts that attach to the USDT probe sites and print structured trace output.

### Probes

| Probe | Trigger |
|---|---|
| `canary` | Checks if a tracer is attached (cached for 1s) |
| `http_request_init` | HTTP request begins (request ID, URI, method) |
| `http_request_shutdown` | HTTP response complete (request ID, status, duration) |
| `http_function` | Function exceeds time threshold during HTTP request |
| `cli_request_init` | CLI process starts (PID, command) |
| `cli_request_shutdown` | CLI process exits (PID) |
| `cli_function` | Function exceeds time threshold during CLI execution |

## Building

### Prerequisites

- [mise](https://mise.jdx.dev/) — manages the Rust toolchain (version pinned in `mise.toml`)
- Node.js 22+
- Docker with Buildx (for APK packaging)

### Native addon (development)

```sh
mise install
mise exec -- cargo build --release
npm install --omit=dev
```

The compiled addon is output to `target/release/libcompass_node.so`.

### APK package

The extension is packaged as an Alpine Linux APK using Docker Bake. The Dockerfile installs `abuild` and invokes it — all build logic (Rust compilation, npm dependency installation, file staging) lives in the [APKBUILD](docker/apk/APKBUILD).

```sh
# Build for both x86_64 and aarch64
docker buildx bake

# Build for a single architecture
docker buildx bake apk-x86_64

# Override version
VERSION=1.2.3 docker buildx bake
```

Built APK files are exported to `dist/apk/<arch>/`.

### APK contents

The APK installs:

| Path | Contents |
|---|---|
| `/usr/lib/compass/node/compass.node` | Compiled native addon |
| `/usr/lib/compass/node/js/` | JavaScript instrumentation layer |
| `/usr/lib/compass/node/node_modules/` | Vendored `import-in-the-middle` dependency |
| `/etc/profile.d/compass-node.sh` | Sets `NODE_OPTIONS` to activate the extension |

## Local development

A Docker Compose setup is provided for local testing with bpftrace:

```sh
docker compose up
```

This builds the extension, starts a test HTTP server on port 3000, and mounts the host kernel tracing interfaces for bpftrace access. The container runs in privileged mode with host PID namespace — required for eBPF/USDT probe attachment.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `COMPASS_ENABLED` | `false` | Enable/disable the extension |
| `COMPASS_FUNCTION_THRESHOLD` | `1000000` | Function duration threshold in nanoseconds before firing a probe |

## Releases

APK packages are built automatically when a GitHub Release is published. The release workflow builds both `x86_64` and `aarch64` APKs in parallel and attaches them as release assets.
