import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PlatformGatePolicy, WindowsTestTargetConfig } from "../cloud/constants";
import { IdleWatchedProcess } from "./IdleWatchedProcess";
import { type PlatformRunContext, PlatformTestTarget } from "./PlatformTestTarget";

export class WindowsSshTarget extends PlatformTestTarget {
  static readonly utmctlPath = "/Applications/UTM.app/Contents/MacOS/utmctl";
  static readonly defaultWorkRoot = "C:\\akan-test";
  //* arm64 has neither a sharp@0.32 prebuilt nor a Chrome for puppeteer's postinstall; x64 users get both.
  static readonly defaultTolerateScriptFailures = ["sharp", "puppeteer"];
  static readonly #runDirPattern = "^\\d{8}-\\d{6}$";
  static readonly #keptRuns = 2;

  readonly platform = "windows";
  readonly policy: PlatformGatePolicy;
  protected override readonly tolerateScriptFailures: string[];
  readonly #config: WindowsTestTargetConfig;
  #host: string;
  #runDir: string | null = null;

  constructor(config: WindowsTestTargetConfig) {
    super();
    this.#config = config;
    this.#host = process.env.AKAN_TEST_WINDOWS_HOST ?? config.host;
    this.policy = config.policy ?? "warn";
    this.tolerateScriptFailures = config.tolerateScriptFailures ?? WindowsSshTarget.defaultTolerateScriptFailures;
  }

  get #workRoot() {
    return this.#config.workRoot ?? WindowsSshTarget.defaultWorkRoot;
  }

  protected async prepare(context: PlatformRunContext) {
    await this.#connect();
    const bunVersion = (await this.#ssh("bun --version")).stdout.trim();
    if (bunVersion !== Bun.version)
      throw new Error(
        `the Windows host runs Bun ${bunVersion || "(none)"}, this host ${Bun.version} — align them first`,
      );
    if ((await this.#ssh("git --version")).exitCode !== 0) throw new Error("git is not installed on the Windows host");
    const runDir = `${this.#workRoot}\\${context.runId}`;
    const mkdir = await this.#ssh(`New-Item -ItemType Directory -Force -Path '${runDir}\\w' | Out-Null`);
    if (mkdir.exitCode !== 0) throw new Error(`could not create ${runDir}: ${mkdir.stderr.trim()}`);
    this.#runDir = runDir;
    for (const [local, remoteName] of [
      [context.snapshot.tarPath, "src.tar"],
      [context.envPath, "env"],
    ] as const) {
      const copied = await WindowsSshTarget.#run([
        ...this.#scpBase(),
        local,
        this.#remoteScpPath(`${runDir}\\${remoteName}`),
      ]);
      if (copied.exitCode !== 0) throw new Error(`scp ${remoteName} failed: ${copied.stderr.trim()}`);
    }
    const extract = await this.exec(
      "tar -xf ..\\src.tar && copy /Y ..\\env .env >nul && git init -q",
      path.join(context.logDir, this.platform, "extract.log"),
      PlatformTestTarget.installIdleMs,
    );
    if (extract.exitCode !== 0) throw new Error("extracting the snapshot on the Windows host failed");
  }

  protected async exec(command: string, logPath: string, idleMs: number) {
    const runDir = this.#runDir;
    if (!runDir) throw new Error("the Windows run directory was not prepared");
    let remotePid: string | null = null;
    const script = [
      "$ProgressPreference = 'SilentlyContinue'",
      "[Console]::OutputEncoding = [Text.Encoding]::UTF8",
      "'PID=' + $PID",
      "$env:GIT_AUTHOR_NAME = 'akan-test'",
      "$env:GIT_AUTHOR_EMAIL = 'akan-test@localhost'",
      "$env:GIT_COMMITTER_NAME = 'akan-test'",
      "$env:GIT_COMMITTER_EMAIL = 'akan-test@localhost'",
      "$env:GIT_CONFIG_COUNT = '1'",
      "$env:GIT_CONFIG_KEY_0 = 'init.defaultBranch'",
      "$env:GIT_CONFIG_VALUE_0 = 'main'",
      `Set-Location -LiteralPath '${runDir}\\w'`,
      `cmd /c "${command} 2>&1"`,
      "exit $LASTEXITCODE",
    ].join("; ");
    return await new IdleWatchedProcess([...this.#sshBase(), script], {
      logPath,
      idleMs,
      onOutput: (text) => {
        remotePid ??= /PID=(\d+)/.exec(text)?.[1] ?? null;
      },
      onIdle: async () => {
        if (remotePid) await this.#ssh(`taskkill /F /T /PID ${remotePid} | Out-Null`);
      },
    }).run();
  }

  protected async cleanup() {
    this.#runDir = null;
    await this.#ssh(
      [
        `Get-ChildItem -LiteralPath '${this.#workRoot}' -Directory`,
        `Where-Object { $_.Name -match '${WindowsSshTarget.#runDirPattern}' }`,
        "Sort-Object Name -Descending",
        `Select-Object -Skip ${WindowsSshTarget.#keptRuns}`,
        "ForEach-Object { cmd /c rmdir /s /q $_.FullName }",
      ].join(" | "),
    );
  }

  async #connect() {
    if ((await this.#ssh("exit 0")).exitCode === 0) return;
    const vm = this.#config.utmVm;
    if (!vm || !existsSync(WindowsSshTarget.utmctlPath))
      throw new Error(`cannot reach ${this.#config.user}@${this.#host} over ssh`);
    const status = (await WindowsSshTarget.#run([WindowsSshTarget.utmctlPath, "status", vm])).stdout.trim();
    if (status !== "started") await WindowsSshTarget.#run([WindowsSshTarget.utmctlPath, "start", vm]);
    for (let attempt = 0; attempt < 24; attempt++) {
      const addresses = (await WindowsSshTarget.#run([WindowsSshTarget.utmctlPath, "ip-address", vm])).stdout;
      const ipv4 = addresses.split(/\s+/).find((address) => /^\d+\.\d+\.\d+\.\d+$/.test(address));
      if (ipv4) this.#host = ipv4;
      if ((await this.#ssh("exit 0")).exitCode === 0) return;
      await Bun.sleep(5_000);
    }
    throw new Error(`UTM VM "${vm}" did not answer ssh at ${this.#host}`);
  }

  #sshOptions() {
    const expand = (file: string) => (file.startsWith("~/") ? path.join(os.homedir(), file.slice(2)) : file);
    return [
      "-i",
      expand(this.#config.identityFile),
      ...(this.#config.knownHostsFile ? ["-o", `UserKnownHostsFile=${expand(this.#config.knownHostsFile)}`] : []),
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=8",
      "-o",
      "ServerAliveInterval=30",
    ];
  }

  #sshBase() {
    return ["ssh", ...this.#sshOptions(), `${this.#config.user}@${this.#host}`];
  }

  #scpBase() {
    return ["scp", "-q", ...this.#sshOptions()];
  }

  #remoteScpPath(windowsPath: string) {
    return `${this.#config.user}@${this.#host}:/${windowsPath.replaceAll("\\", "/")}`;
  }

  async #ssh(script: string) {
    return await WindowsSshTarget.#run([...this.#sshBase(), script]);
  }

  static async #run(command: string[]) {
    const proc = Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout, stderr, exitCode };
  }
}
