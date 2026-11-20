import {
  type Arch,
  archs,
  type DockerConfig,
  type DockerImageConfig,
  type DockerOption,
  type DockerRun,
  type LibDockerConfig,
} from "./types";

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
export const DOCKER_BASE_PACKAGES = ["ca-certificates", "tzdata", "tini"] as const;
//? Every generated image runs these on its base; an image built with them is one `baseSetup: false` can start from.
export const DOCKER_BASE_RUNS = [
  `apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends ${DOCKER_BASE_PACKAGES.join(" ")} && rm -rf /var/lib/apt/lists/*`,
  "ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime",
];
//? The directories the server writes, its code staying read-only; an empty named volume mounted on one takes its owner.
export const DOCKER_WRITE_DIRS = [
  "/workspace/sqlite",
  "/workspace/local",
  "/workspace/runtime",
  "/workspace/data",
  "/workspace/.akan/artifact/image-cache",
];

export const DOCKER_VARIANT_FILE_PREFIX = "Dockerfile.";
export const DOCKER_IGNORED = [
  ...DOCKER_WRITE_DIRS.map((dir) => dir.slice("/workspace/".length)),
  "node_modules",
  //? Copied in, a variant's Dockerfile would rebuild every other image's `COPY . .` layer when it alone changed.
  `${DOCKER_VARIANT_FILE_PREFIX}*`,
];
export const DOCKER_INSTALL_STAGE = "install";
//? Raised when the sections change: a tool editing the file then meets a number it does not know, and can say so.
export const DOCKERFILE_FORMAT = 1;
export const dockerfileSections = ["install-stage", "base", "pre-runs", "install", "post-runs", "app"] as const;
export type DockerfileSection = (typeof dockerfileSections)[number];
const DOCKERFILE_MARK = "# akan:";
const DOCKERFILE_HEAD = `${DOCKERFILE_MARK}dockerfile `;
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

//? Docker ends an unquoted ENV value at a space; inside quotes it still expands `$NAME`.
const dockerEnvValue = (value: string) => (/[\s"'\\]/.test(value) ? JSON.stringify(value) : value);

const dockerEnvLines = (build: Record<string, string>, declared: Record<string, string>) => {
  const lines = new Map(Object.entries(build).map(([key, value]) => [key, `ENV ${key}=${value}`]));
  for (const [key, value] of Object.entries(declared)) lines.set(key, `ENV ${key}=${dockerEnvValue(value)}`);
  return [...lines.values()];
};

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

const dockerfileSectionOf = (section: DockerfileSection, instructions: string[]) =>
  instructions.length ? [`${DOCKERFILE_MARK}${section}`, ...instructions] : [];

export const dockerfileOf = (docker: DockerImageConfig, { env, lockfile, guard }: DockerfileParts) => {
  const { image, preRuns, postRuns, command, crossBuild, baseSetup } = docker;
  const install = dockerInstallScripts(docker, lockfile);
  return [
    `${DOCKERFILE_HEAD}${DOCKERFILE_FORMAT}`,
    ...dockerfileSectionOf(
      "install-stage",
      crossBuild
        ? [
            //? One image for every target: the stage runs on the build machine, where a per-architecture image may not.
            `FROM --platform=$BUILDPLATFORM ${typeof image === "string" ? image : DEFAULT_DOCKER_IMAGE} AS ${DOCKER_INSTALL_STAGE}`,
            "ARG TARGETARCH",
            ...install,
          ]
        : [],
    ),
    ...dockerfileSectionOf("base", [
      dockerImageScript(image),
      ...(guard ? [guard] : []),
      ...(baseSetup ? dockerRunScripts(DOCKER_BASE_RUNS) : []),
      "ARG TARGETARCH",
    ]),
    ...dockerfileSectionOf("pre-runs", dockerRunScripts(preRuns)),
    ...dockerfileSectionOf(
      "install",
      crossBuild ? ["WORKDIR /workspace", `COPY --from=${DOCKER_INSTALL_STAGE} /workspace ./`] : install,
    ),
    ...dockerfileSectionOf("post-runs", dockerRunScripts(postRuns)),
    ...dockerfileSectionOf("app", [
      "COPY . .",
      `RUN mkdir -p ${DOCKER_WRITE_DIRS.join(" ")} && chown ${DOCKER_RUN_USER} ${DOCKER_WRITE_DIRS.join(" ")}`,
      ...dockerEnvLines(env, docker.env),
      `USER ${DOCKER_RUN_USER}`,
      `ENTRYPOINT ${JSON.stringify(DOCKER_INIT)}`,
      `CMD ${JSON.stringify(command)}`,
    ]),
  ].join("\n");
};

export interface DockerfileLayout {
  format: number;
  /** Each section's lines under its marker, in the file's order; a newer format may name one this version lacks. */
  sections: Map<string, string[]>;
}

export const dockerfileLayoutOf = (dockerfile: string): DockerfileLayout | null => {
  const [head = "", ...lines] = dockerfile.split("\n");
  if (!/^# akan:dockerfile \d+$/.test(head)) return null;
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith(DOCKERFILE_MARK)) {
      current = [];
      sections.set(line.slice(DOCKERFILE_MARK.length), current);
    } else current?.push(line);
  }
  return { format: Number(head.slice(DOCKERFILE_HEAD.length)), sections };
};

/** First occurrence wins, so a step a lib and its app both declare becomes one layer. */
const dedupeDockerRuns = (runs: DockerRun[]): DockerRun[] => {
  const byKey = new Map<string, DockerRun>();
  for (const run of runs) byKey.set(typeof run === "string" ? run : JSON.stringify(run), run);
  return [...byKey.values()];
};

const dockerEnvKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
//? The name ends `Dockerfile.<name>`, which a shell, a CI step and `docker build -f` all take unquoted.
const dockerVariantNamePattern = /^[a-z][a-z0-9-]*$/;

const resolveDockerImage = (
  docker: Partial<DockerImageConfig>,
  libDocker: LibDockerConfig,
  owner: string,
): DockerImageConfig => {
  const env = docker.env ?? {};
  for (const [key, value] of Object.entries(env)) {
    if (!dockerEnvKeyPattern.test(key))
      throw new Error(`[docker] ${owner}.env names "${key}", which is not an environment variable name`);
    if (/[\r\n]/.test(value))
      throw new Error(`[docker] ${owner}.env.${key} holds a line break, which an ENV line cannot carry`);
  }
  const { image } = docker;
  const baseSetup = docker.baseSetup ?? true;
  //? The pinned default has no tini, the entrypoint: an image skipping the base step without one never starts.
  if (!baseSetup && (!image || (typeof image !== "string" && archs.some((arch) => !image[arch]))))
    throw new Error(
      `[docker] ${owner}.baseSetup is false, so ${owner}.image has to name an image built with the base step, for every architecture`,
    );
  return {
    image: image ?? DEFAULT_DOCKER_IMAGE,
    preRuns: dedupeDockerRuns([...libDocker.preRuns, ...(docker.preRuns ?? [])]),
    installRuns: dedupeDockerRuns([...libDocker.installRuns, ...(docker.installRuns ?? [])]),
    postRuns: dedupeDockerRuns([...libDocker.postRuns, ...(docker.postRuns ?? [])]),
    command: docker.command ?? ["bun", "main.js"],
    crossBuild: docker.crossBuild ?? false,
    baseSetup,
    env,
  };
};

/** A declared Dockerfile string is verbatim, so a lib's steps are dropped rather than silently unapplied. */
export const resolveDocker = (docker: DockerOption | undefined, libDocker: LibDockerConfig): DockerConfig =>
  typeof docker === "string" ? docker : resolveDockerImage(docker ?? {}, libDocker, "docker");

export const resolveDockerVariants = (
  docker: DockerOption | undefined,
  libDocker: LibDockerConfig,
): Record<string, DockerImageConfig> => {
  if (typeof docker === "string" || !docker?.variants) return {};
  const { variants, ...base } = docker;
  return Object.fromEntries(
    Object.entries(variants).map(([name, variant]) => {
      if (!dockerVariantNamePattern.test(name))
        throw new Error(
          `[docker] docker.variants names "${name}", which cannot end a file name: use lowercase letters, digits and "-"`,
        );
      const env = { ...base.env, ...variant.env };
      return [name, resolveDockerImage({ ...base, ...variant, env }, libDocker, `docker.variants.${name}`)];
    }),
  );
};
