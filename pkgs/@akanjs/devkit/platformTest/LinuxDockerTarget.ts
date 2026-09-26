import os from "node:os";
import path from "node:path";
import type { LinuxTestTargetConfig, PlatformGatePolicy } from "../cloud/constants";
import { IdleWatchedProcess } from "./IdleWatchedProcess";
import { type PlatformRunContext, PlatformTestTarget } from "./PlatformTestTarget";

export class LinuxDockerTarget extends PlatformTestTarget {
  static readonly cacheVolume = "akan-test-bun-cache";

  readonly platform = "linux";
  readonly policy: PlatformGatePolicy;
  readonly #config: LinuxTestTargetConfig;
  #container: string | null = null;

  constructor(config: LinuxTestTargetConfig = {}) {
    super();
    this.#config = config;
    this.policy = config.policy ?? "gate";
  }

  //* No compiler in the image, on purpose: with a toolchain present at install time ssh2 builds its native
  //* addon, and Bun then panics loading it (`uv_version_string`, oven-sh/bun#18546).
  static readonly dockerfile = [
    `FROM oven/bun:${Bun.version}-slim`,
    "RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates procps lsof && rm -rf /var/lib/apt/lists/*",
  ].join("\n");

  get image() {
    return `akan-test-linux:bun-${Bun.version}-${Bun.hash(LinuxDockerTarget.dockerfile).toString(16).slice(0, 8)}`;
  }

  protected async prepare(context: PlatformRunContext) {
    if ((await LinuxDockerTarget.#docker(["info"])).exitCode !== 0)
      throw new Error("Docker is not running — start Docker Desktop, or leave linux out of --platforms");
    await this.#ensureImage();
    const container = `akan-test-${context.runId}`;
    const cpus = this.#config.cpus ?? Math.max(2, Math.floor(os.availableParallelism() / 2));
    const started = await LinuxDockerTarget.#docker([
      "run",
      "-d",
      "--rm",
      "--name",
      container,
      "--cpus",
      String(cpus),
      ...(this.#config.memory ? ["--memory", this.#config.memory] : []),
      "-v",
      `${LinuxDockerTarget.cacheVolume}:/root/.bun/install/cache`,
      "-v",
      `${path.dirname(context.snapshot.tarPath)}:/io:ro`,
      "-v",
      `${context.envPath}:/io-env:ro`,
      "-w",
      "/w",
      this.image,
      "sleep",
      "infinity",
    ]);
    if (started.exitCode !== 0) throw new Error(`docker run failed: ${started.stderr.trim()}`);
    this.#container = container;
    const extract = await this.exec(
      `tar -xf /io/${path.basename(context.snapshot.tarPath)} -C /w && cp /io-env /w/.env && git -C /w init -q`,
      path.join(context.logDir, this.platform, "extract.log"),
      PlatformTestTarget.installIdleMs,
    );
    if (extract.exitCode !== 0) throw new Error("extracting the snapshot into the container failed");
  }

  protected async exec(command: string, logPath: string, idleMs: number) {
    const container = this.#container;
    if (!container) throw new Error("the linux container is not running");
    return await new IdleWatchedProcess(
      ["docker", "exec", ...LinuxDockerTarget.#gitIdentityEnv(), container, "sh", "-c", command],
      {
        logPath,
        idleMs,
        onIdle: async () => {
          await LinuxDockerTarget.#docker(["exec", container, "pkill", "-9", "bun"]);
        },
      },
    ).run();
  }

  protected async cleanup() {
    if (this.#container) await LinuxDockerTarget.#docker(["rm", "-f", this.#container]);
    this.#container = null;
  }

  async #ensureImage() {
    if ((await LinuxDockerTarget.#docker(["image", "inspect", this.image])).exitCode === 0) return;
    const built = await LinuxDockerTarget.#docker(["build", "-t", this.image, "-"], LinuxDockerTarget.dockerfile);
    if (built.exitCode !== 0) throw new Error(`building ${this.image} failed: ${built.stderr.trim().slice(-400)}`);
  }

  static #gitIdentityEnv() {
    return Object.entries({
      GIT_AUTHOR_NAME: "akan-test",
      GIT_AUTHOR_EMAIL: "akan-test@localhost",
      GIT_COMMITTER_NAME: "akan-test",
      GIT_COMMITTER_EMAIL: "akan-test@localhost",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "init.defaultBranch",
      GIT_CONFIG_VALUE_0: "main",
    }).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  }

  static async #docker(args: string[], stdin?: string) {
    const proc = Bun.spawn(["docker", ...args], {
      stdin: stdin === undefined ? "ignore" : new Response(stdin),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode };
  }
}
