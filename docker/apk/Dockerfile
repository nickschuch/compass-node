# Dockerfile for building the compass-node Alpine APK package.
#
# The Dockerfile's only responsibility is to install abuild and invoke it.
# All build logic (Rust compilation, npm install, file staging) lives in APKBUILD.

FROM alpine:3.21

ARG PKGVER=0.1.0

# Intentionally not using --no-cache so that the package index remains
# available for abuild -r to auto-install makedepends.
RUN apk add alpine-sdk

# Generate a throwaway package signing key and install it.
RUN abuild-keygen -a -n && \
    cp /root/.abuild/*.rsa.pub /etc/apk/keys/

WORKDIR /src

# Copy all source into the working directory.
COPY . .

# Substitute the package version into the APKBUILD.
RUN sed -i "s/^pkgver=.*/pkgver=${PKGVER}/" docker/apk/APKBUILD

# Run abuild from the APKBUILD location.
# -F allows running as root, -r auto-installs makedepends from the APKBUILD.
WORKDIR /src/docker/apk
RUN abuild -F -r

# ---------------------------------------------------------------------------
# Export stage — holds only the built .apk files for extraction via --output.
# The glob flattens abuild's nested repo/arch directory structure.
# ---------------------------------------------------------------------------
FROM scratch
COPY --from=0 /root/packages/*/*/*.apk /
