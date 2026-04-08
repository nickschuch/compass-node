# Multi-stage Dockerfile for building and testing the Compass Node.js extension.
#
# Stage 1: Build the native Rust addon (.node file) using napi-rs.
# Stage 2: Runtime image with Node.js + bpftrace + the compiled extension.

# ---------------------------------------------------------------------------
# Stage 1: Build the native addon
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

  RUN apk add --no-cache \
      build-base \
      clang \
      clang-dev \
      curl \
      musl-dev

  # Install mise for Rust toolchain management.
  ENV MISE_DATA_DIR="/mise"
  ENV MISE_CONFIG_DIR="/mise"
  ENV MISE_CACHE_DIR="/mise/cache"
  ENV MISE_INSTALL_PATH="/usr/local/bin/mise"
  ENV PATH="/mise/shims:$PATH"

  RUN curl https://mise.run | sh

  WORKDIR /build

  # Copy Rust project files.
  COPY Cargo.toml Cargo.lock* build.rs ./
  COPY src ./src

  # Copy mise.toml for Rust version.
  COPY mise.toml ./mise.toml
  RUN mise trust .

  ENV RUSTFLAGS="-C target-feature=-crt-static"

  # Build the native addon in release mode.
  RUN mise exec -- cargo build --release

  # The output is a shared library. Rename it to compass.node for Node.js.
  RUN cp target/release/libcompass_node.so /build/compass.node

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine

  RUN apk add --no-cache bpftrace bash

  WORKDIR /app

  # Install the Compass extension to the system path.
  RUN mkdir -p /usr/lib/compass/node/js /usr/lib/compass/node/node_modules

  # Copy the compiled native addon.
  COPY --from=build /build/compass.node /usr/lib/compass/node/compass.node

  # Copy the JavaScript instrumentation layer.
  COPY js/ /usr/lib/compass/node/js/

  # Install import-in-the-middle to the extension's node_modules.
  COPY package.json /tmp/package.json
  RUN cd /tmp && npm install --omit=dev && \
      cp -r /tmp/node_modules/* /usr/lib/compass/node/node_modules/ && \
      rm -rf /tmp/node_modules /tmp/package.json /tmp/package-lock.json

  # Copy bpftrace scripts.
  COPY bpftrace/ /data/bpftrace/

  # Ensure the app directory is explicitly CJS so that import-in-the-middle's
  # ESM resolver hooks do not mishandle .js files.
  RUN echo '{"type":"commonjs"}' > /app/package.json

  # Copy the test application.
  COPY docker/compose/node/app.js /app/app.js
  COPY docker/compose/node/handlers.js /app/handlers.js
  COPY docker/compose/node/cli.js /app/cli.js

  # Activate Compass extension via NODE_OPTIONS.
  ENV NODE_OPTIONS="--import /usr/lib/compass/node/js/index.mjs"
  ENV COMPASS_ENABLED=true
  ENV COMPASS_FUNCTION_THRESHOLD=1000000

  EXPOSE 3000

  CMD ["node", "app.js"]
