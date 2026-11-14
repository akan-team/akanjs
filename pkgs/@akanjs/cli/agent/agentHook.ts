import { realpathSync } from "node:fs";
import path from "node:path";
import type { Workspace } from "@akanjs/devkit/commandDecorators";
import { WorkspaceVersionCheck } from "@akanjs/devkit/commandDecorators/workspaceVersionCheck";
import { Logger } from "akanjs/common";
import { ApplicationRunner } from "../application/application.runner";
import { VerifyComments } from "../verify/verifyComments";
import { VerifyPipeline } from "../verify/verifyPipeline";
import { VerifyReport, type VerifyResult } from "../verify/verifyReport";
import { VerifyScope } from "../verify/verifyScope";
import { WorkspaceRunner } from "../workspace/workspace.runner";

export type AgentHookEvent = "pre-edit" | "post-edit" | "stop";

export interface AgentHookInput {
  session_id?: string;
  tool_input?: { file_path?: string };
  stop_hook_active?: boolean;
}

export interface AgentHookOutcome {
  block: boolean;
  message: string;
}

interface HookEntry {
  matcher?: string;
  hooks?: { type?: string; command?: string }[];
}

export class AgentHook {
  static readonly events = ["pre-edit", "post-edit", "stop"] as const;
  static readonly editTools = "Edit|Write";
  static readonly generated = [
    "apps/*/client.ts",
    "apps/*/server.ts",
    "{apps,libs}/*/lib/{cnst,db,dict,sig,srv,st,useClient,useServer}.ts",
    "{apps,libs}/*/lib/**/index.ts",
    "{apps,libs}/*/{ui,webkit,srvkit,common,plugin}/index.ts",
  ] as const;
  readonly #workspace: Workspace;
  readonly #cliVersion: string | undefined;

  constructor(workspace: Workspace, { cliVersion = process.env.AKAN_VERSION }: { cliVersion?: string } = {}) {
    this.#workspace = workspace;
    this.#cliVersion = cliVersion;
  }

  static isEvent(value: string | null): value is AgentHookEvent {
    return AgentHook.events.some((event) => event === value);
  }

  //? Claude Code reads a decision from stdout JSON on exit 0; plain stdout on exit 0 only reaches its debug log.
  static respond(event: AgentHookEvent, outcome: AgentHookOutcome) {
    if (!outcome.block) return null;
    if (event === "pre-edit")
      return JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: outcome.message,
        },
      });
    return JSON.stringify({ decision: "block", reason: outcome.message });
  }

  static command(event: AgentHookEvent) {
    return `cd "$CLAUDE_PROJECT_DIR" && bun run --silent akan agent hook ${event}`;
  }

  //* Entries running `akan agent hook` are ours to replace; every other hook in the file is the user's and stays.
  static mergeSettings<Settings extends Record<string, unknown>>(existing: Settings) {
    const hooks = { ...((existing.hooks ?? {}) as Record<string, HookEntry[]>) };
    const ours = (entry: HookEntry) => !!entry.hooks?.some((hook) => hook.command?.includes("akan agent hook"));
    const add = (name: string, entry: HookEntry) => {
      hooks[name] = [...(hooks[name] ?? []).filter((current) => !ours(current)), entry];
    };
    const hook = (event: AgentHookEvent, timeout: number) => [
      { type: "command", command: AgentHook.command(event), timeout },
    ];
    add("PreToolUse", { matcher: AgentHook.editTools, hooks: hook("pre-edit", 30) });
    add("PostToolUse", { matcher: AgentHook.editTools, hooks: hook("post-edit", 120) });
    add("Stop", { hooks: hook("stop", 600) });
    return { ...existing, hooks };
  }

  async run(event: AgentHookEvent, input: AgentHookInput): Promise<AgentHookOutcome> {
    const file = event === "stop" ? null : this.#relative(input.tool_input?.file_path);
    if (event === "pre-edit") return file ? this.#preEdit(file) : { block: false, message: "" };
    if (file) await this.#record(input.session_id, file);
    //? Verify writes (sync, fixes) as `akan verify` would, so it is skipped as that is refused, yet never blocks.
    const refusal = WorkspaceVersionCheck.refusal(
      this.#cliVersion,
      ["bun", "akan", "verify"],
      this.#workspace.workspaceRoot,
    );
    if (refusal) {
      process.stderr.write(`${refusal}\n`);
      return { block: false, message: refusal };
    }
    if (event === "stop") return await this.#stop(input);
    if (!file) return { block: false, message: "" };
    return await this.#verify([file], { lintOnly: true });
  }

  #preEdit(file: string): AgentHookOutcome {
    const pattern = AgentHook.generated.find((glob) => new Bun.Glob(glob).match(file));
    if (!pattern) return { block: false, message: "" };
    return {
      block: true,
      message: `${file} is generated (${pattern}). Edit the source file it is generated from, then run \`akan sync <app-or-lib>\`.`,
    };
  }

  //? Claude Code sets `stop_hook_active` once a Stop hook has already sent it back; a second block could loop forever.
  async #stop(input: AgentHookInput): Promise<AgentHookOutcome> {
    const ledger = this.#ledgerPath(input.session_id);
    const files = (await this.#workspace.exists(ledger))
      ? (await this.#workspace.readFile(ledger)).split("\n").filter(Boolean)
      : [];
    if (files.length === 0) return { block: false, message: "" };
    const result = await this.#verified(files, { lintOnly: false });
    const comments = result?.diagnostics.filter((diagnostic) => diagnostic.code === VerifyComments.code).length ?? 0;
    const block = !!result && (!result.ok || comments > 0);
    if (!block || input.stop_hook_active) await this.#workspace.remove(ledger);
    const message = result ? VerifyReport.text(result) : "";
    if (!block || input.stop_hook_active) return { block: false, message };
    const lead = comments
      ? `${comments} comment${comments === 1 ? "" : "s"} added since the last commit in files you edited; delete each one the code already says, then stop again.`
      : null;
    return { block: true, message: lead ? `${lead}\n${message}` : message };
  }

  async #verify(files: string[], { lintOnly }: { lintOnly: boolean }): Promise<AgentHookOutcome> {
    const result = await this.#verified(files, { lintOnly });
    return result ? { block: !result.ok, message: VerifyReport.text(result) } : { block: false, message: "" };
  }

  async #verified(files: string[], { lintOnly }: { lintOnly: boolean }): Promise<VerifyResult | null> {
    const [apps, libs, pkgs] = await this.#workspace.getExecs();
    const scope = VerifyScope.resolve(
      files.map((file) => ({ code: " M", file })),
      { apps, libs, pkgs },
    );
    if (scope.targets.length === 0) return null;
    const consoleOutput = Logger.consoleOutput;
    Logger.consoleOutput = false;
    return await new VerifyPipeline(this.#workspace, new WorkspaceRunner(), new ApplicationRunner())
      .run(scope, { lintOnly })
      .finally(() => {
        Logger.consoleOutput = consoleOutput;
      });
  }

  async #record(session: string | undefined, file: string) {
    const ledger = this.#ledgerPath(session);
    const current = (await this.#workspace.exists(ledger)) ? await this.#workspace.readFile(ledger) : "";
    if (current.split("\n").includes(file)) return;
    await this.#workspace.writeFile(ledger, `${current}${file}\n`, { silent: true });
  }

  #ledgerPath(session?: string) {
    return `.akan/agent/edits-${(session ?? "default").replace(/[^\w-]/g, "_")}.txt`;
  }

  #relative(file?: string) {
    if (!file) return null;
    const root = AgentHook.#physical(this.#workspace.workspaceRoot);
    const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
    const relative = path.relative(root, AgentHook.#physical(absolute));
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return relative.split(path.sep).join("/");
  }

  //? Claude Code reports a path as the folder was opened (`/tmp/…`) while the CLI's cwd is resolved (`/private/tmp/…`).
  static #physical(target: string): string {
    try {
      return realpathSync(target);
    } catch {
      const parent = path.dirname(target);
      return parent === target ? target : path.join(AgentHook.#physical(parent), path.basename(target));
    }
  }
}
