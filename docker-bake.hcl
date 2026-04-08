# Docker Bake file for building the compass-node Alpine APK package.
#
# Usage:
#   docker buildx bake                              # build both architectures
#   docker buildx bake apk-x86_64                  # build a single architecture
#   VERSION=1.2.3 docker buildx bake                # override version

variable "VERSION" {
  default = "0.1.0"
}

group "default" {
  targets = ["apk-x86_64", "apk-aarch64"]
}

target "apk" {
  matrix = {
    arch = ["x86_64", "aarch64"]
  }
  name       = "apk-${arch}"
  context    = "."
  dockerfile = "docker/apk/Dockerfile"
  platforms  = [arch == "x86_64" ? "linux/amd64" : "linux/arm64"]
  args = {
    PKGVER = VERSION
  }
  output = ["type=local,dest=dist/apk/${arch}"]
}
