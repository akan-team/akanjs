// Leaf and lazy imports only: the codeAgent barrel loads the heavy engine, and every runner loads for `akan --help`.
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
  compactAt?: number;
  json: boolean;
  thinking: boolean;
  resume?: string;
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
    const address = listen ? CodeAgentRpcListener.parse(listen) : null;
    const agent = await CodeAgent.create({ ...(await CodeRunner.#agentOptions(options, true)), mode: "rpc" });
    if (!address) return await new CodeAgentRpcHost(agent).serve();
    const listener = new CodeAgentRpcListener(new CodeAgentRpcHost(agent, null), address).listen();
    process.stderr.write(
      `akan code rpc listening on ${"unix" in address ? address.unix : `${address.hostname}:${listener.port}`}\n`,
    );
    await listener.serve();
  }

  async tui(options: CodeRunOptions, seed: string) {
    const [{ CodeAgent }, { CodeTui }] = await Promise.all([
      import("@akanjs/devkit/codeAgent/agent/CodeAgent"),
      import("./CodeTui"),
    ]);
    const agentOptions = await CodeRunner.#agentOptions(options, false);
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
        }).run(prompt);
        autoCompactAt = agent.info.autoCompactAt;
      } finally {
        agent.dispose();
      }
      if (!next) return;
      resume = next.id;
      notice = next.notice;
      prompt = "";
    }
  }

  async run(prompt: string, options: CodeRunOptions) {
    const { CodeAgent } = await import("@akanjs/devkit/codeAgent/agent/CodeAgent");
    const agent = await CodeAgent.create(await CodeRunner.#agentOptions(options, false));
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

  static async #agentOptions(options: CodeRunOptions, hostAttached: boolean) {
    const profile = CodeRunner.profileOf(options, { hostAttached });
    return {
      workspace: options.workspace,
      cwd: profile.paths.root,
      profile,
      apps: options.app ? [options.app] : await options.workspace.getApps(),
      model: CodeRunner.modelOf(options.model),
      ...(options.compactAt !== undefined ? { autoCompactAt: options.compactAt } : {}),
    };
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
