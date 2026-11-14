// `1-slim` floats to whichever Bun is newest at build time, one the framework was never tested on.
//? The multi-arch index digest; after a Bun bump, `docker buildx imagetools inspect oven/bun:<version>-slim` prints it.
export const DEFAULT_DOCKER_IMAGE =
  "oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4";
//? oven/bun's `bun` user, numeric so a kubelet can check `runAsNonRoot` without reading the image's passwd file.
export const DOCKER_RUN_USER = "1000:1000";
//? Docker hands an empty named volume the owner of the image directory it mounts over, so these exist already owned.
export const DOCKER_VOLUME_DIRS = ["/workspace/sqlite", "/workspace/local"];
