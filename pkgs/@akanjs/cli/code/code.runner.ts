// Reached at the leaf rather than through `@akanjs/devkit/codeAgent`: that barrel loads the engine, and this
// module is imported for `akan --help` like every other runner.
import { akanCodeDefaultModel, type CodeAgentModelRef } from "@akanjs/devkit/codeAgent/agent/akanCodeModel";
import { CodeAgentStreamPrinter } from "@akanjs/devkit/codeAgent/agent/CodeAgentStreamPrinter";
import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { type CodeAgentProfile, codeAgentPresets, isCodeAgentPresetName } from "akanjs/common";
import type { CodeTuiExit } from "./CodeTui";

export interface CodeRunOptions {
  workspace: Workspace;
  app?: string;
  profile: string;
  model?: string;
  json: boolean;
  thinking: boolean;
  resume?: string;
}

export class CodeRunner extends runner("code") {
  /**
   * Serves the agent over stdio as akan wire frames, for a host that drives it from another process.
   *
   * `consoleToStderr` is imported first and on its own line: it must run before the engine's module body does,
   * or anything the engine logs while loading lands on stdout and corrupts the very first frame.
   */
  async serve(options: CodeRunOptions, listen?: string) {
    await import("@akanjs/devkit/codeAgent/agent/consoleToStderr");
    const [{ CodeAgent }, { CodeAgentRpcHost }, { CodeAgentRpcListener }] = await Promise.all([
      import("@akanjs/devkit/codeAgent/agent/CodeAgent"),
      import("@akanjs/devkit/codeAgent/agent/CodeAgentRpcHost"),
      import("@akanjs/devkit/codeAgent/agent/CodeAgentRpcListener"),
    ]);
    const address = listen ? CodeAgentRpcListener.parse(listen) : null;
    const profile = CodeRunner.profileOf(options, { hostAttached: true });
    const agent = await CodeAgent.create({
      workspace: options.workspace,
      cwd: profile.paths.root,
      profile,
      apps: options.app ? [options.app] : await options.workspace.getApps(),
      model: CodeRunner.modelOf(options.model),
      mode: "rpc",
    });
    if (!address) return await new CodeAgentRpcHost(agent).serve();
    const listener = new CodeAgentRpcListener(new CodeAgentRpcHost(agent, null), address).listen();
    process.stderr.write(
      `akan code rpc listening on ${"unix" in address ? address.unix : `${address.hostname}:${listener.port}`}\n`,
    );
    await listener.serve();
  }

  /**
   * The interactive terminal host.
   *
   * It reads the same wire the printer and the RPC host read, so what it can draw is exactly what the
   * contract carries — see {@link CodeTui}.
   */
  async tui(options: CodeRunOptions, seed: string) {
    const [{ CodeAgent }, { CodeTui }] = await Promise.all([
      import("@akanjs/devkit/codeAgent/agent/CodeAgent"),
      import("./CodeTui"),
    ]);
    const profile = CodeRunner.profileOf(options, { hostAttached: false });
    const apps = options.app ? [options.app] : await options.workspace.getApps();
    let resume = options.resume;
    let prompt = seed;
    let notice: string | undefined;
    // Switching sessions builds a new agent rather than re-pointing this one: the engine binds its extensions,
    // its tool registry and its context to the session at construction, so half of what a session is would
    // stay behind. The host is cheap to rebuild; the session is not cheap to swap.
    for (;;) {
      const agent = await CodeAgent.create({
        workspace: options.workspace,
        cwd: profile.paths.root,
        profile,
        apps,
        model: CodeRunner.modelOf(options.model),
        mode: "tui",
        ...(resume ? { resume } : {}),
      });
      let next: CodeTuiExit | undefined;
      try {
        next = await new CodeTui(agent, {
          thinking: options.thinking,
          ...(notice ? { notice } : {}),
        }).run(prompt);
      } finally {
        agent.dispose();
      }
      if (!next) return;
      resume = next.id;
      notice = next.notice;
      prompt = "";
    }
  }

  /**
   * Runs one prompt to completion and prints the event stream.
   *
   * Non-interactive on purpose: it is the smallest host that exercises the whole contract, and a script or a CI
   * step wants exactly this shape.
   */
  async run(prompt: string, options: CodeRunOptions) {
    // The engine costs ~122MiB resident on import, and `akan --help` loads every command module. Importing it
    // here rather than at the top of the file keeps that cost on the one command that needs it.
    const { CodeAgent } = await import("@akanjs/devkit/codeAgent/agent/CodeAgent");
    const profile = CodeRunner.profileOf(options, { hostAttached: false });
    const agent = await CodeAgent.create({
      workspace: options.workspace,
      cwd: profile.paths.root,
      profile,
      apps: options.app ? [options.app] : await options.workspace.getApps(),
      model: CodeRunner.modelOf(options.model),
    });
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

  static profileOf(options: CodeRunOptions, { hostAttached }: { hostAttached: boolean }): CodeAgentProfile {
    if (!isCodeAgentPresetName(options.profile))
      throw new Error(`Unknown profile: ${options.profile}. Use local, pod, review, or web.`);
    const root = options.app
      ? `${options.workspace.workspaceRoot}/apps/${options.app}`
      : options.workspace.workspaceRoot;
    const profile = codeAgentPresets[options.profile](root);
    return { ...profile, ui: { ...profile.ui, canPrompt: CodeRunner.canPrompt(profile, hostAttached) } };
  }

  //* A host on the RPC wire is someone to ask; a pod job with none must never park a turn in `awaiting`.
  static canPrompt(profile: CodeAgentProfile, hostAttached: boolean) {
    const forced = process.env.AKAN_CODE_CAN_PROMPT;
    if (forced === "1") return true;
    if (forced === "0") return false;
    return hostAttached || profile.ui.canPrompt;
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
