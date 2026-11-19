import { type Arch, archs, type DockerImageConfig, type DockerRun } from "./types";

//? A Bun bump changes both: `docker buildx imagetools inspect oven/bun:<version>-slim` prints the new multi-arch digest.
export const BUN_IMAGE_PIN = {
  version: "1.4.4",
  digest: "sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4",
} as const;
// `1-slim` floats to whichever Bun is newest at build time, one the framework was never tested on.
export const DEFAULT_DOCKER_IMAGE = `oven/bun:${BUN_IMAGE_PIN.version}-slim@${BUN_IMAGE_PIN.digest}`;
//? oven/bun's `bun` user, numeric so a kubelet can check `runAsNonRoot` without reading the image's passwd file.
export const DOCKER_RUN_USER = "1000:1000";
//? Bun as PID 1 never waits for a process re-parented to it, which stays defunct; `-s` reaps under another init too.
export const DOCKER_INIT = ["tini", "-s", "--"];
//? The directories the server writes, its code staying read-only; an empty named volume mounted on one takes its owner.
export const DOCKER_WRITE_DIRS = [
  "/workspace/sqlite",
  "/workspace/local",
  "/workspace/runtime",
  "/workspace/data",
  "/workspace/.akan/artifact/image-cache",
];

export const DOCKER_IGNORED = [...DOCKER_WRITE_DIRS.map((dir) => dir.slice("/workspace/".length)), "node_modules"];
export const DOCKER_INSTALL_STAGE = "install";
//? Bun names the CPU x64 where Docker's TARGETARCH says amd64.
const DOCKER_INSTALL_TARGET = `--os linux --cpu "$(echo "$TARGETARCH" | sed s/amd64/x64/)"`;

const archGuard = (arch: string, script: string) => `if [ "$TARGETARCH" = "${arch}" ]; then \
    ${script}; \
  fi`;

export const dockerRunScripts = (runs: DockerRun[]) =>
  runs.map((run) =>
    typeof run === "string"
      ? `RUN ${run}`
      : Object.entries(run)
          .map(([arch, script]) => `RUN ${archGuard(arch, script)}`)
          .join("\n"),
  );

//? A stage named by `TARGETARCH` is the only one a build resolves, so the other architecture's image is never pulled.
export const dockerImageScript = (image: string | { [key in Arch]?: string }) =>
  typeof image === "string"
    ? `FROM ${image}`
    : [...archs.map((arch) => `FROM ${image[arch] ?? DEFAULT_DOCKER_IMAGE} AS ${arch}`), "FROM $TARGETARCH"].join("\n");

export interface DockerfileParts {
  env: Record<string, string>;
  lockfile: boolean;
  /** Instructions the final stage opens with. */
  guard?: string;
}

const dockerInstallScripts = (
  { installRuns, crossBuild }: Pick<DockerImageConfig, "installRuns" | "crossBuild">,
  lockfile: boolean,
) => {
  const install = `bun install --production${lockfile ? " --frozen-lockfile" : ""}${crossBuild ? ` ${DOCKER_INSTALL_TARGET}` : ""}`;
  //? In a subshell each: a step ending in `|| true` would otherwise forgive a failed `bun install` before it.
  const steps = installRuns.flatMap((run) =>
    typeof run === "string" ? [`( ${run} )`] : Object.entries(run).map(([arch, script]) => archGuard(arch, script)),
  );
  return [
    "WORKDIR /workspace",
    lockfile ? "COPY ./package.json ./bun.lock ./" : "COPY ./package.json ./package.json",
    `RUN ${[install, ...steps].join(" \\\n  && ")}`,
  ];
};

export const dockerfileOf = (docker: DockerImageConfig, { env, lockfile, guard }: DockerfileParts) => {
  const { image, preRuns, postRuns, command, crossBuild } = docker;
  const install = dockerInstallScripts(docker, lockfile);
  return [
    ...(crossBuild
      ? [
          //? One image for every target: the stage runs on the build machine, where a per-architecture image may not.
          `FROM --platform=$BUILDPLATFORM ${typeof image === "string" ? image : DEFAULT_DOCKER_IMAGE} AS ${DOCKER_INSTALL_STAGE}`,
          "ARG TARGETARCH",
          ...install,
        ]
      : []),
    dockerImageScript(image),
    ...(guard ? [guard] : []),
    "RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ca-certificates tzdata tini && rm -rf /var/lib/apt/lists/*",
    "RUN ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime",
    "ARG TARGETARCH",
    ...dockerRunScripts(preRuns),
    ...(crossBuild ? ["WORKDIR /workspace", `COPY --from=${DOCKER_INSTALL_STAGE} /workspace ./`] : install),
    ...dockerRunScripts(postRuns),
    "COPY . .",
    `RUN mkdir -p ${DOCKER_WRITE_DIRS.join(" ")} && chown ${DOCKER_RUN_USER} ${DOCKER_WRITE_DIRS.join(" ")}`,
    ...Object.entries(env).map(([key, value]) => `ENV ${key}=${value}`),
    `USER ${DOCKER_RUN_USER}`,
    `ENTRYPOINT ${JSON.stringify(DOCKER_INIT)}`,
    `CMD ${JSON.stringify(command)}`,
  ].join("\n");
};
