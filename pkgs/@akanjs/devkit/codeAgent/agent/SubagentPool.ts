import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { type CodeAgentProfile, type CodeAgentSubagent, codeAgentReadOnlyBuiltins } from "akanjs/common";
import { Type } from "typebox";
import type { Workspace } from "../../commandDecorators";
import type { CodeAgentModelRef } from "./akanCodeModel";

export interface SubagentPoolOptions {
  workspace: Workspace;
  cwd: string;
  parent: CodeAgentProfile;
  /** The parent's model, read when a task starts: a child runs on the model the parent runs on now. */
  model?: () => CodeAgentModelRef | undefined;
  depth: number;
  /** What the tree above this pool has spent and has running; a root pool starts its own. */
  spend?: SubagentSpend;
  onNotice?: (message: string) => void;
  /** The running children, whole, for a host that draws them as a rail beside the prompt. */
  onAgents?: (agents: CodeAgentSubagent[]) => void;
}

/** One object shared down a sub-agent tree, so a single token budget and a single concurrency limit bound it. */
export interface SubagentSpend {
  tokens: number;
  running: number;
}

const maxResultChars = 8_000;

// Children are re-reported every second: their token counts climb between start and finish.
const tickMs = 1_000;

export type SubagentKind = keyof typeof SubagentPool.kinds;

// Only a child's answer crosses back, never its transcript. Depth, concurrency and token ceilings are checked
// before a child exists, because an unbounded recursive `task` is a fork bomb that bills per token.
export class SubagentPool {
  static readonly kinds = {
    explore: {
      readOnly: true,
      desc: "reads, searches and reports back. It cannot write a file or run a command.",
    },
    code: {
      readOnly: false,
      desc: "makes the change itself, with the same tools as this session.",
    },
  } as const;

  // A writer works unwatched on the parent's checkout, so it has to be asked for by name, never defaulted.
  static readonly defaultKind: SubagentKind = "explore";

  readonly #options: SubagentPoolOptions;
  readonly #children = new Map<
    string,
    { kind: SubagentKind; description: string; startedAt: number; agent?: { tokensUsed: number } }
  >();
  readonly #spend: SubagentSpend;
  #ticker: ReturnType<typeof setInterval> | null = null;

  constructor(options: SubagentPoolOptions) {
    this.#options = options;
    this.#spend = options.spend ?? { tokens: 0, running: 0 };
  }

  static extensionFor(options: SubagentPoolOptions): InlineExtension | undefined {
    if (!options.parent.tools.subagent) return undefined;
    if (options.depth >= options.parent.tools.subagent.maxDepth) return undefined;
    const pool = new SubagentPool(options);
    return { name: "akan-subagent", factory: (pi: ExtensionAPI) => pool.#register(pi) };
  }

  static readonly toolName = "task";

  #register(pi: ExtensionAPI) {
    pi.registerTool({
      name: SubagentPool.toolName,
      label: "Task",
      description:
        "Run a focused sub-agent on one self-contained question and get back its answer. Use it for searching and reading that would otherwise fill this conversation — the sub-agent's own reading does not come back, only its answer. Give it everything it needs: it cannot see this conversation.",
      promptSnippet: "task: run a sub-agent on one self-contained question and get back only its answer",
      parameters: Type.Object({
        description: Type.String({ description: "Three to five words naming the task, for the activity log." }),
        prompt: Type.String({
          description: "The complete instruction. The sub-agent sees nothing of this conversation.",
        }),
        type: Type.Optional(
          Type.Union(
            Object.entries(SubagentPool.kinds).map(([kind, spec]) => Type.Literal(kind, { description: spec.desc })),
            { description: `What the sub-agent may do. Defaults to ${SubagentPool.defaultKind}.` },
          ),
        ),
      }),
      execute: async (id, params, signal) => {
        const kind = (params.type ?? SubagentPool.defaultKind) as SubagentKind;
        const refusal = this.#refuse();
        if (refusal) return { content: [{ type: "text", text: refusal }], details: undefined, isError: true };
        this.#spend.running += 1;
        this.#children.set(id, { kind, description: params.description, startedAt: Date.now() });
        this.#report();
        // Announced at start: a turn quiet for a minute while a child reads looks like one that stopped responding.
        this.#options.onNotice?.(`${kind} sub-agent · ${params.description}`);
        try {
          const text = await this.#run(id, kind, params.prompt, signal);
          return { content: [{ type: "text", text }], details: undefined };
        } finally {
          this.#spend.running -= 1;
          this.#children.delete(id);
          this.#report();
        }
      },
    });
  }

  #refuse() {
    const budget = this.#options.parent.tools.subagent;
    if (!budget) return "Sub-agents are disabled by this profile.";
    // Refused, never queued: every ancestor keeps its slot while it waits on its child, so a queued child deadlocks.
    if (this.#spend.running >= budget.maxConcurrent)
      return `Too many sub-agents are already running (limit ${budget.maxConcurrent} at once, counted across the whole task tree). ${this.#children.size ? "Wait for one of yours to finish, or do" : "Do"} this part yourself.`;
    if (this.#spend.tokens >= budget.budget)
      return `The sub-agent token budget (${budget.budget}) is spent. Do the rest of this work yourself.`;
    return undefined;
  }

  /** The parent profile narrowed, never widened: no session file, no `AGENTS.md`, nobody to ask; skills stay. */
  static childOf(parent: CodeAgentProfile, kind: SubagentKind): CodeAgentProfile {
    const budget = parent.tools.subagent;
    return {
      ...parent,
      name: `${parent.name}:${kind}`,
      tools: {
        ...parent.tools,
        // Filtered, not replaced: a child of a read-only session must never gain a write tool.
        builtin: SubagentPool.kinds[kind].readOnly
          ? parent.tools.builtin.filter((tool) => codeAgentReadOnlyBuiltins.includes(tool))
          : parent.tools.builtin,
        subagent: budget ? { ...budget, maxDepth: budget.maxDepth } : false,
      },
      session: { store: "memory", crossSession: false },
      ui: { canPrompt: false },
      context: { projectFiles: false, skills: parent.context.skills },
    };
  }

  // One ticker per pool, unref'd: a child left registered is a bug that must not hold the process open.
  #report() {
    const onAgents = this.#options.onAgents;
    if (!onAgents) return;
    onAgents(
      [...this.#children].map(([id, child]) => ({
        id,
        kind: child.kind,
        description: child.description,
        startedAt: child.startedAt,
        tokens: child.agent?.tokensUsed ?? 0,
      })),
    );
    if (this.#children.size && !this.#ticker) {
      this.#ticker = setInterval(() => this.#report(), tickMs);
      this.#ticker.unref?.();
    } else if (!this.#children.size && this.#ticker) {
      clearInterval(this.#ticker);
      this.#ticker = null;
    }
  }

  async #run(id: string, kind: SubagentKind, prompt: string, signal: AbortSignal | undefined) {
    const { CodeAgent } = await import("./CodeAgent");
    const budget = this.#options.parent.tools.subagent;
    const child = SubagentPool.childOf(this.#options.parent, kind);
    const model = this.#options.model?.();
    const agent = await CodeAgent.create({
      workspace: this.#options.workspace,
      cwd: this.#options.cwd,
      profile: child,
      ...(model ? { model } : {}),
      apps: [],
      depth: this.#options.depth + 1,
      subagentSpend: this.#spend,
    });
    const running = this.#children.get(id);
    if (running) running.agent = agent;
    let stopped = false;
    const abort = () => {
      stopped = true;
      void agent.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });
    // A listener added to an already-aborted signal never fires: this child was stopped while it was being created.
    if (signal?.aborted) stopped = true;
    let finished = false;
    try {
      let answer = "";
      agent.on((event) => {
        if (event.type === "message" && event.role === "assistant") answer = event.text;
        // The engine drops an abort that lands before its run is live, so a stopped child is stopped again there.
        if (event.type === "turn_start" && stopped) void agent.abort();
      });
      if (!stopped) {
        await agent.prompt(prompt);
        await agent.waitForIdle();
      }
      finished = true;
      return answer.length > maxResultChars
        ? `${answer.slice(0, maxResultChars)}\n…(truncated)`
        : answer || "(no answer)";
    } finally {
      signal?.removeEventListener("abort", abort);
      // Whatever the outcome: a failed or stopped child was billed too, and its own children are counted by its pool.
      const tokens = agent.tokensUsed;
      this.#spend.tokens += tokens;
      const outcome = stopped ? "stopped" : finished ? "finished" : "failed";
      const ceiling = budget ? budget.budget : 0;
      this.#options.onNotice?.(
        `${kind} sub-agent ${outcome}, ${tokens} tokens (${this.#spend.tokens} of ${ceiling} spent)`,
      );
      agent.dispose();
    }
  }
}
