import { type Arch, archs, type DockerRun } from "./types";

//? A Bun bump changes both: `docker buildx imagetools inspect oven/bun:<version>-slim` prints the new multi-arch digest.
export const BUN_IMAGE_PIN = {
  version: "1.4.4",
  digest: "sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4",
} as const;
// `1-slim` floats to whichever Bun is newest at build time, one the framework was never tested on.
export const DEFAULT_DOCKER_IMAGE = `oven/bun:${BUN_IMAGE_PIN.version}-slim@${BUN_IMAGE_PIN.digest}`;
//? oven/bun's `bun` user, numeric so a kubelet can check `runAsNonRoot` without reading the image's passwd file.
export const DOCKER_RUN_USER = "1000:1000";
//? The directories the server writes, its code staying read-only; an empty named volume mounted on one takes its owner.
export const DOCKER_WRITE_DIRS = [
  "/workspace/sqlite",
  "/workspace/local",
  "/workspace/runtime",
  "/workspace/data",
  "/workspace/.akan/artifact/image-cache",
];

export const dockerRunScripts = (runs: DockerRun[]) =>
  runs.map((run) =>
    typeof run === "string"
      ? `RUN ${run}`
      : Object.entries(run)
          .map(
            ([arch, script]) => `RUN if [ "$TARGETARCH" = "${arch}" ]; then \
    ${script}; \
  fi`,
          )
          .join("\n"),
  );

export const dockerImageScript = (image: string | { [key in Arch]?: string }) =>
  typeof image === "string"
    ? `FROM ${image}`
    : archs.map((arch) => `FROM ${image[arch] ?? DEFAULT_DOCKER_IMAGE} AS ${arch}`).join("\n");
