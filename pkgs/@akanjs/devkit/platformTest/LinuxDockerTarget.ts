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

  //* No compiler in the image: with one, ssh2 builds its native addon and Bun panics loading it (oven-sh/bun#18546).
  //* apt goes over https: a captive portal answers plain http with its splash page, which apt reports as unsigned.
  static readonly dockerfile = [
    `FROM oven/bun:${Bun.version}-slim`,
    "RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/debian.sources && apt-get update && apt-get install -y --no-install-recommends git ca-certificates procps lsof && rm -rf /var/lib/apt/lists/*",
  ].join("\n");

  get image() {
    return `akan-test-linux:bun-${Bun.version}-${Bun.hash(LinuxDockerTarget.dockerfile).toString(16).slice(0, 8)}`;
  }

  protected async prepare(context: PlatformRunContext) {
    if ((await LinuxDockerTarget.spawnText(["docker", "info"])).exitCode !== 0)
      throw new Error("Docker is not running — start Docker Desktop, or leave linux out of --platforms");
    await this.#ensureImage();
    const container = `akan-test-${context.runId}`;
    const cpus = this.#config.cpus ?? Math.max(2, Math.floor(os.availableParallelism() / 2));
    const started = await LinuxDockerTarget.spawnText([
      "docker",
      "run",
      "-d",
      "--rm",
      //? An init as PID 1 reaps orphans as a real host does; under `sleep` a killed orphan stays a zombie that still
      //? answers kill(pid, 0).
      "--init",
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
      [
        "docker",
        "exec",
        ...Object.entries(PlatformTestTarget.remoteEnv).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
        container,
        "sh",
        "-c",
        command,
      ],
      {
        logPath,
        idleMs,
        onIdle: async () => {
          await LinuxDockerTarget.spawnText(["docker", "exec", container, "pkill", "-9", "bun"]);
        },
      },
    ).run();
  }

  protected async cleanup() {
    if (this.#container) await LinuxDockerTarget.spawnText(["docker", "rm", "-f", this.#container]);
    this.#container = null;
  }

  async #ensureImage() {
    if ((await LinuxDockerTarget.spawnText(["docker", "image", "inspect", this.image])).exitCode === 0) return;
    const built = await LinuxDockerTarget.spawnText(
      ["docker", "build", "-t", this.image, "-"],
      LinuxDockerTarget.dockerfile,
    );
    if (built.exitCode !== 0) throw new Error(`building ${this.image} failed: ${built.stderr.trim().slice(-400)}`);
  }
}
