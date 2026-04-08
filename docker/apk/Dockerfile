# Dockerfile for building the compass-node Alpine APK package.
#
# The Dockerfile's only responsibility is to install abuild and invoke it.
# All build logic (Rust compilation, npm install, file staging) lives in APKBUILD.

FROM alpine:3.21

ARG PKGVER=0.1.0

RUN apk add --no-cache alpine-sdk

# Create a dedicated abuild user and generate a throwaway package signing key.
RUN adduser -D -G abuild abuild && \
    su abuild -c "abuild-keygen -a -i -n"

USER abuild
WORKDIR /home/abuild/compass-node

# Copy all source into the working directory.
COPY --chown=abuild:abuild . .

# Substitute the package version into the APKBUILD.
RUN sed -i "s/^pkgver=.*/pkgver=${PKGVER}/" docker/apk/APKBUILD

# Run abuild from the APKBUILD location.
WORKDIR /home/abuild/compass-node/docker/apk
RUN abuild -F checksum && abuild -F

# ---------------------------------------------------------------------------
# Export stage — holds only the built .apk files for extraction via --output.
# ---------------------------------------------------------------------------
FROM scratch
COPY --from=0 /home/abuild/packages/ /
