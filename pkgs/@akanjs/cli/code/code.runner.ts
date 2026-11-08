// Leaf and lazy imports only: the codeAgent barrel loads the heavy engine, and every runner loads for `akan --help`.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AkanCodeEnv } from "@akanjs/devkit/codeAgent/agent/AkanCodeEnv";
import { akanCodeDefaultModel, type CodeAgentModelRef } from "@akanjs/devkit/codeAgent/agent/akanCodeModel";
import { akanCodePaths } from "@akanjs/devkit/codeAgent/agent/akanCodePaths";
import { CodeAgentStreamPrinter } from "@akanjs/devkit/codeAgent/agent/CodeAgentStreamPrinter";
import { WorkspaceTrust, type WorkspaceTrustKind } from "@akanjs/devkit/codeAgent/agent/WorkspaceTrust";
import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { type CodeAgentProfile, codeAgentPresets, isCodeAgentPresetName } from "akanjs/common";
import { CodeTrustPrompt, type CodeTrustPromptStreams } from "./CodeTrustPrompt";
import type { CodeTuiExit } from "./CodeTui";

export interface CodeRunOptions {
  workspace: Workspace;
  app?: string;
  profile: string;
  model?: string;
  compactAt?: number;
  json: boolean;
  thinking: boolean;
  resume?: string;
  trustWorkspace?: boolean;
  askNetwork?: boolean;
  rpcBindAny?: boolean;
  rpcToken?: boolean;
}

interface CodeStartMode {
  hostAttached: boolean;
  interactive: boolean;
  ask: boolean;
}

export class CodeRunner extends runner("code") {
  async serve(options: CodeRunOptions, listen?: string) {
    // Must run before the engine loads, or what it logs while loading corrupts the first stdout frame.
    await import("@akanjs/devkit/codeAgent/agent/consoleToStderr");
    const [{ CodeAgent }, { CodeAgentRpcHost }, { CodeAgentRpcListener }] = await Promise.all([
      import("@akanjs/devkit/codeAgent/agent/CodeAgent"),
      import("@akanjs/devkit/codeAgent/agent/CodeAgentRpcHost"),
      import("@akanjs/devkit/codeAgent/agent/CodeAgentRpcListener"),
    ]);
    const address = listen ? CodeAgentRpcListener.parse(listen, { anyHost: !!options.rpcBindAny }) : null;
    const tcp = !!address && !("unix" in address);
    const tokenFile = tcp && options.rpcToken !== false ? AkanCodeEnv.get("AKAN_CODE_RPC_TOKEN_FILE") : undefined;
    const token = !tcp || options.rpcToken === false ? null : CodeRunner.#rpcTokenFrom(tokenFile);
    const start = await CodeRunner.#start(options, { hostAttached: true, interactive: false, ask: false });
    for (const warning of start.warnings) process.stderr.write(`${warning}\n`);
    const agent = await CodeAgent.create({ ...start.agent, mode: "rpc" });
    if (!address) return await new CodeAgentRpcHost(agent).serve();
    const listener = new CodeAgentRpcListener(new CodeAgentRpcHost(agent, null), address, { token }).listen();
    const where = "unix" in address ? address.unix : `${address.hostname}:${listener.port}`;
    const written = token && !tokenFile ? CodeRunner.#writeRpcToken(listener.port ?? 0, token) : undefined;
    const tokenAt = tokenFile ?? written;
    process.stderr.write(
      tokenAt
        ? `akan code rpc listening on ${where}; open with {"auth":"<token>"}, the token is in ${tokenAt}\n`
        : `akan code rpc listening on ${where}\n`,
    );
    if (tcp && !token)
      process.stderr.write("No token is asked for, so any process on this machine can drive this agent.\n");
    try {
      await listener.serve();
    } finally {
      if (written) rmSync(written, { force: true });
    }
  }

  async tui(options: CodeRunOptions, seed: string) {
    const [{ CodeAgent }, { CodeTui }] = await Promise.all([
      import("@akanjs/devkit/codeAgent/agent/CodeAgent"),
      import("./CodeTui"),
    ]);
    const start = await CodeRunner.#start(options, { hostAttached: false, interactive: true, ask: true });
    const agentOptions = start.agent;
    let warnings: string[] = start.warnings;
    let resume = options.resume;
    let autoCompactAt = agentOptions.autoCompactAt;
    let prompt = seed;
    let notice: string | undefined;
    // A session switch rebuilds the agent: the engine binds extensions, tools and context to it at construction.
    for (;;) {
      const agent = await CodeAgent.create({
        ...agentOptions,
        mode: "tui",
        ...(resume ? { resume } : {}),
        ...(autoCompactAt ? { autoCompactAt } : {}),
      });
      let next: CodeTuiExit | undefined;
      try {
        next = await new CodeTui(agent, {
          thinking: options.thinking,
          ...(notice ? { notice } : {}),
          warnings,
        }).run(prompt);
        autoCompactAt = agent.info.autoCompactAt;
      } finally {
        agent.dispose();
      }
      if (!next) return;
      resume = next.id;
      notice = next.notice;
      warnings = [];
      prompt = "";
    }
  }

  async run(prompt: string, options: CodeRunOptions) {
    const { CodeAgent } = await import("@akanjs/devkit/codeAgent/agent/CodeAgent");
    const ask = !!process.stdin.isTTY && !!process.stderr.isTTY;
    const start = await CodeRunner.#start(options, { hostAttached: false, interactive: false, ask });
    for (const warning of start.warnings) process.stderr.write(`${warning}\n`);
    const agent = await CodeAgent.create(start.agent);
    const printer = new CodeAgentStreamPrinter({ json: options.json, thinking: options.thinking });
    agent.on((event) => printer.print(event));
    agent.announce();
    try {
      await agent.prompt(prompt);
      await agent.waitForIdle();
    } finally {
      printer.finish();
      agent.dispose();
    }
  }

  static async #start(options: CodeRunOptions, mode: CodeStartMode) {
    const profile = CodeRunner.profileOf(options, mode);
    const trust = await CodeRunner.trust(options.workspace.workspaceRoot, profile, {
      trustWorkspace: !!options.trustWorkspace,
      ...(mode.ask && process.stdin.isTTY ? { streams: { input: process.stdin, output: process.stderr } } : {}),
    });
    const agent = {
      workspace: options.workspace,
      cwd: profile.paths.root,
      profile,
      apps: options.app ? [options.app] : await options.workspace.getApps(),
      model: CodeRunner.modelOf(options.model),
      ...(options.compactAt !== undefined ? { autoCompactAt: options.compactAt } : {}),
    };
    return { agent, warnings: [...CodeRunner.startWarnings(profile), ...trust] };
  }

  static profileOf(
    options: CodeRunOptions,
    { hostAttached, interactive = true }: { hostAttached: boolean; interactive?: boolean },
  ): CodeAgentProfile {
    if (!isCodeAgentPresetName(options.profile))
      throw new Error(`Unknown profile: ${options.profile}. Use local, pod, review, or web.`);
    const root = options.app
      ? `${options.workspace.workspaceRoot}/apps/${options.app}`
      : options.workspace.workspaceRoot;
    const profile = codeAgentPresets[options.profile](root);
    const { askOutside: _ask, ...network } = profile.network;
    return {
      ...profile,
      ...(options.askNetwork === false ? { network } : {}),
      ui: { ...profile.ui, canPrompt: CodeRunner.canPrompt(profile, hostAttached, interactive) },
    };
  }

  //* A host on the RPC wire is someone to ask; a pod job or a one-shot run with none must never park a turn.
  static canPrompt(profile: CodeAgentProfile, hostAttached: boolean, interactive = true) {
    const forced = AkanCodeEnv.get("AKAN_CODE_CAN_PROMPT");
    if (forced === "1") return true;
    if (forced === "0") return false;
    return hostAttached || (interactive && profile.ui.canPrompt);
  }

  static startWarnings(profile: CodeAgentProfile) {
    return [
      ...AkanCodeEnv.ignored(),
      ...(profile.name === "local"
        ? [
            "The local profile is not a sandbox: it refuses known secret files and asks before an unlisted host, but a command it runs can read anything you can. Use --profile pod inside a container to isolate it.",
          ]
        : []),
    ];
  }

  static async trust(
    workspaceRoot: string,
    profile: CodeAgentProfile,
    { trustWorkspace, streams }: { trustWorkspace: boolean; streams?: CodeTrustPromptStreams },
  ) {
    const kinds: WorkspaceTrustKind[] = profile.tools.mcp === "off" ? ["extensions"] : ["mcp", "extensions"];
    const pending = WorkspaceTrust.pending(workspaceRoot, kinds);
    if (!pending.length) return [];
    if (trustWorkspace) {
      WorkspaceTrust.approve(workspaceRoot, pending, false);
      return [];
    }
    if (streams && (await CodeTrustPrompt.ask(pending, streams))) {
      WorkspaceTrust.approve(workspaceRoot, pending, true);
      return [];
    }
    return [CodeTrustPrompt.skipped(pending)];
  }

  static #rpcTokenFrom(file: string | undefined) {
    if (!file || !existsSync(file)) {
      const token = randomBytes(32).toString("base64url");
      if (file) CodeRunner.#writePrivate(file, token);
      return token;
    }
    const token = readFileSync(file, "utf8").trim();
    if (!token) throw new Error(`AKAN_CODE_RPC_TOKEN_FILE names ${file}, which is empty.`);
    return token;
  }

  static #writeRpcToken(port: number, token: string) {
    const file = akanCodePaths.rpcTokenFile(port);
    CodeRunner.#writePrivate(file, token);
    return file;
  }

  static #writePrivate(file: string, content: string) {
    akanCodePaths.ensureGlobalDir();
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, `${content}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
  }

  static modelOf(model: string | undefined): CodeAgentModelRef | undefined {
    if (!model) return undefined;
    const [provider, ...rest] = model.split("/");
    if (!provider || !rest.length)
      throw new Error(
        `Model must be "<provider>/<id>", e.g. ${akanCodeDefaultModel.provider}/${akanCodeDefaultModel.id}`,
      );
    return { provider, id: rest.join("/") };
  }
}
