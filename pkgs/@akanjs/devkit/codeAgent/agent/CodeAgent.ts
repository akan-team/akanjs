import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionAPI,
  type InlineExtension,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  type CodeAgentAnswer,
  type CodeAgentEffort,
  type CodeAgentEvent,
  type CodeAgentEventBody,
  type CodeAgentImage,
  type CodeAgentMcpStatus,
  type CodeAgentProfile,
  type CodeAgentProviderInfo,
  type CodeAgentQuestion,
  type CodeAgentSessionInfo,
  type CodeAgentState,
  codeAgentClip,
  codeAgentLabelChars,
  codeAgentRenderAnswer,
  codeAgentSessionName,
} from "akanjs/common";
import type { Workspace } from "../../commandDecorators";
import { AkanCodePlugins } from "../tools/AkanCodePlugins";
import { DeepSeekWeb } from "../tools/DeepSeekWeb";
import { AkanCodeCompaction } from "./AkanCodeCompaction";
import { AkanCodeServices } from "./AkanCodeServices";
import {
  akanCodeModel,
  akanCodeModelSupportsImages,
  akanCodeModelWarnings,
  type CodeAgentModelRef,
} from "./akanCodeModel";
import { akanCodePaths } from "./akanCodePaths";
import { CodeAgentAsks } from "./CodeAgentAsks";
import { CodeAgentEventMapper } from "./CodeAgentEventMapper";
import { CodeAgentGate } from "./CodeAgentGate";
import { CodeAgentProxy } from "./CodeAgentProxy";
import { CodeAgentSuspended } from "./CodeAgentSuspended";
import { CodeAgentUi } from "./CodeAgentUi";
import { CodeMailbox } from "./CodeMailbox";
import { CodeSessionFork } from "./CodeSessionFork";
import { CodeSessionIndex } from "./CodeSessionIndex";
import type { SubagentSpend } from "./SubagentPool";

// The engine's run-mode type is not re-exported from its package entry, so the literal set is restated.
export type CodeAgentHostMode = "tui" | "rpc" | "json" | "print";

export interface CodeAgentOptions {
  workspace: Workspace;
  cwd?: string;
  profile: CodeAgentProfile;
  model?: CodeAgentModelRef;
  /** Percent of the context window that starts a compaction, in steps of 10. */
  autoCompactAt?: number;
  /** Apps whose dev server and preview the turn-end feedback loop watches. */
  apps?: string[];
  extensions?: InlineExtension[];
  customTools?: ToolDefinition[];
  /** `print` for a one-shot stream, `rpc` when a host drives this process over stdio. */
  mode?: CodeAgentHostMode;
  /** How many `task` tools deep this agent already is. */
  depth?: number;
  /** The tally (tokens spent, sub-agents running) of the sub-agent tree whose `task` opened this agent. */
  subagentSpend?: SubagentSpend;
  /** Id of a stored session to continue instead of opening a new one. */
  resume?: string;
}

export class CodeAgent {
  readonly #profile: CodeAgentProfile;
  readonly #gate: CodeAgentGate;
  readonly #mapper = new CodeAgentEventMapper();
  readonly #asks = new CodeAgentAsks();
  #suspended = new CodeAgentSuspended(null);
  readonly #listeners = new Set<(event: CodeAgentEvent) => void>();
  #session: AgentSession | undefined;
  #disposePlugins: (() => void) | undefined;
  #seq = 0;
  #disposed = false;
  #sessionDir: string | undefined;
  #mailbox: CodeMailbox | undefined;
  #mcp: CodeAgentMcpStatus[] = [];
  #workspaceRoot = "";
  // Cleared at `idle`: an earlier turn is in the transcript; only the turn in flight exists nowhere else.
  readonly #replay: CodeAgentEvent[] = [];
  #replayFrom = 0;
  #lastContextTokens: number | undefined;
  #autoCompactAt: number | undefined;

  private constructor(profile: CodeAgentProfile) {
    this.#profile = profile;
    this.#gate = new CodeAgentGate(profile);
  }

  static async create(options: CodeAgentOptions) {
    const workspaceRoot = options.workspace.workspaceRoot;
    const cwd = options.cwd ?? workspaceRoot;
    const agent = new CodeAgent(options.profile);
    const autoCompactAt = AkanCodeCompaction.normalize(options.autoCompactAt);
    const settingsManager = AkanCodeServices.settings();
    const proxy = CodeAgentProxy.fromEnv(options.profile);
    const modelRuntime = await AkanCodeServices.runtime(workspaceRoot, proxy);
    const model = await akanCodeModel(modelRuntime, options.model);
    const compaction = settingsManager.getCompactionSettings(model);
    const modelWarnings = akanCodeModelWarnings(model, compaction.reserveTokens + compaction.keepRecentTokens);

    const akan = await AkanCodePlugins.build({
      workspace: options.workspace,
      cwd,
      profile: options.profile,
      apps: options.apps ?? [],
      canSeeImages: akanCodeModelSupportsImages(model),
      deepseek: await DeepSeekWeb.fromRuntime(modelRuntime, !!proxy),
      depth: options.depth ?? 0,
      ...(options.subagentSpend ? { subagentSpend: options.subagentSpend } : {}),
      currentSessionId: () => agent.sessionId,
      mailbox: () => agent.#mailbox,
      onNotice: (message) => agent.#emit({ type: "notice", level: "warning", message }),
      onAgents: (agents) => agent.#emit({ type: "subagent", agents }),
      onAsk: (question) => agent.ask(question),
    });

    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: akanCodePaths.globalDir(),
      settingsManager,
      ...AkanCodeServices.resourceOptions({
        workspaceRoot,
        cwd,
        profile: options.profile,
        extensions: [agent.#gateExtension(), ...akan.extensions, ...(options.extensions ?? [])],
      }),
    });
    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd,
      agentDir: akanCodePaths.globalDir(),
      modelRuntime,
      settingsManager,
      resourceLoader,
      model,
      sessionManager: AkanCodeServices.sessions(workspaceRoot, cwd, options.profile, options.resume),
      noTools: "builtin",
      tools: [...options.profile.tools.builtin, ...akan.toolNames],
      customTools: options.customTools,
    });
    agent.#disposePlugins = akan.dispose;
    agent.#mcp = akan.mcp;
    agent.#workspaceRoot = workspaceRoot;
    if (options.profile.session.store !== "memory") agent.#sessionDir = akanCodePaths.sessionsDir(workspaceRoot);
    await agent.#attach(session, options.mode ?? "print");
    const autoCompactWarning = agent.#fitAutoCompact(autoCompactAt);
    agent.#suspended = new CodeAgentSuspended(CodeAgentSuspended.fileOf(agent.#sessionDir, agent.sessionId));
    if (agent.#sessionDir && options.profile.session.store === "file")
      agent.#openMail(akanCodePaths.mailDir(workspaceRoot), cwd);
    for (const message of [...modelWarnings, ...autoCompactWarning])
      agent.#emit({ type: "notice", level: "warning", message });
    return agent;
  }

  get profile() {
    return this.#profile;
  }

  get canSeeImages() {
    const model = this.#session?.model;
    return model ? akanCodeModelSupportsImages(model) : false;
  }

  /** The workspace's stored sessions, newest first. Empty on a profile that keeps none. */
  sessions() {
    return this.#sessionDir ? CodeSessionIndex.list(this.#sessionDir) : [];
  }

  /** The repo, which is not `profile.paths.root` — that one is narrowed to an app by `akan code --app`. */
  get workspaceRoot() {
    return this.#workspaceRoot;
  }

  /**
   * As assembled at creation: the tool allowlist is fixed then, so a server declared later is unreachable. A
   * server's `auth` still turns `required` when a call's token cannot be renewed, until a reload.
   */
  mcpServers(): CodeAgentMcpStatus[] {
    return this.#mcp;
  }

  /** The other `akan code` sessions running in this workspace right now. */
  peers() {
    return this.#mailbox?.peers() ?? [];
  }

  /** The peer receives the text as a prompt of its own, queued as a follow-up when it is mid-turn. */
  send(target: string, text: string) {
    const mailbox = this.#mailbox;
    if (!mailbox) throw new Error("This profile keeps no shared mailbox, so it has no peers.");
    const peer = mailbox.find(target);
    if (!peer) throw new Error(`No live session matches "${target}". Ask for the list first.`);
    mailbox.send(peer.id, text);
    return peer;
  }

  #openMail(dir: string, cwd: string) {
    const session = this.#session;
    if (!session) return;
    this.#mailbox = new CodeMailbox(dir, session.sessionId, session.sessionName ?? session.sessionId.slice(0, 8));
    this.#mailbox.open(cwd, (mail) => {
      const from = `${mail.fromName} (${mail.from.slice(0, 8)})`;
      this.#emit({ type: "notice", level: "info", message: `message from ${from}` });
      void this.#prompt(`Message from another session — ${from}:\n${mail.text}`).catch((error: unknown) =>
        this.#emit({ type: "notice", level: "error", message: String(error) }),
      );
    });
  }

  get sessionId() {
    return this.#session?.sessionId ?? "";
  }

  get isStreaming() {
    return this.#session?.isStreaming ?? false;
  }

  get tokensUsed() {
    return this.#session?.getSessionStats().tokens.total ?? 0;
  }

  get info(): CodeAgentSessionInfo {
    const session = this.#require();
    const model = session.model;
    return {
      sessionId: session.sessionId,
      cwd: this.#profile.paths.root,
      profile: this.#profile.name,
      model: model ? { provider: model.provider, id: model.id, name: model.name } : undefined,
      tools: session.getActiveToolNames(),
      contextTokens: model?.contextWindow,
      // Not `off`: that is a setting of a reasoning model, not the absence of reasoning.
      effort: session.supportsThinking() ? session.thinkingLevel : undefined,
      autoCompactAt: this.#autoCompactAt,
      name: session.sessionName,
      interaction: this.#profile.interaction,
    };
  }

  /** A `session` frame minted outside this counter would carry `seq: 0`, which every client drops. */
  announce() {
    this.#emit({ type: "session", info: this.info });
    this.#restore();
    //* A resumed worker says again what it is still waiting on, or a host that reattached has no card to answer.
    const { question, approvals } = this.#suspended;
    if (question) this.#emit({ type: "question", question });
    for (const request of approvals) this.#emit({ type: "approval", request });
  }

  // Prose only: a past turn's tool calls would redraw rows nobody waits on, against a tree that has moved since.
  #restore() {
    const session = this.#session;
    if (!session) return;
    const turnId = `restored:${session.sessionId}`;
    for (const message of session.messages) {
      if (message.role !== "user" && message.role !== "assistant") continue;
      const text = CodeAgent.#textOf(message.content);
      if (text) this.#emit({ type: "message", turnId, role: message.role, text });
    }
    this.#emitContextNow();
  }

  static #textOf(content: unknown) {
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";
    return content
      .map((part) => (typeof part === "object" && part && "text" in part ? String(part.text) : ""))
      .join("")
      .trim();
  }

  on(listener: (event: CodeAgentEvent) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** One turn's worth of frames is kept for reconnection; a client further behind reloads the transcript. */
  static readonly replayLimit = 2_000;

  /** `frames` only when `sinceSeq` is given; a client behind `replayFrom` has to reload the transcript. */
  async state({ sinceSeq }: { sinceSeq?: number } = {}): Promise<CodeAgentState> {
    const base = { info: this.info, streaming: this.isStreaming, replayFrom: this.#replayFrom };
    if (sinceSeq === undefined) return base;
    return { ...base, frames: this.#replay.filter((event) => event.seq > sinceSeq) };
  }

  async prompt(message: string, images?: CodeAgentImage[]) {
    this.#suspended.clear();
    await this.#prompt(message, images);
  }

  async #prompt(message: string, images?: CodeAgentImage[]) {
    const session = this.#require();
    // From the first prompt, not the answer, so the session is not nameless while it is worth watching.
    if (!session.sessionName && message.trim()) this.setName(codeAgentSessionName(message));
    const attachments = await CodeAgent.#attachments(images);
    const options = attachments.length ? { images: attachments } : {};
    if (session.isStreaming) return await session.prompt(message, { ...options, streamingBehavior: "followUp" });
    await session.prompt(message, { ...options, source: "extension" });
  }

  async abort() {
    // The engine finalizes an interrupted message as an ordinary stop, so the abort is noted here.
    this.#mapper.noteOutcome("aborted");
    this.#asks.clear();
    await this.#require().abort();
  }

  // Not via `prompt`: that opens a turn with the question slot still filled, which the engine does not stop.
  async answer(questionId: string, answer: CodeAgentAnswer) {
    const question = this.#asks.questionOf(questionId);
    const rendered = question ? codeAgentRenderAnswer(question, answer) : (answer.text ?? "");
    if (this.#asks.answer(questionId, rendered)) {
      this.#emit({ type: "question_resolved", questionId, answer, rendered });
      return true;
    }
    if (this.#profile.interaction.question !== "suspend") return false;
    const suspended = this.#suspended.takeQuestion(questionId);
    if (!suspended) return false;
    const suspendedRendered = codeAgentRenderAnswer(suspended, answer);
    this.#emit({ type: "question_resolved", questionId, answer, rendered: suspendedRendered });
    // As prose: compaction and the next turn read message content only, so a structured-only answer is lost.
    await this.#prompt(`The user answered: ${suspendedRendered}\nContinue the task.`);
    return true;
  }

  async approve(approvalId: string, approved: boolean) {
    if (this.#asks.resolveApproval(approvalId, approved)) {
      this.#emit({ type: "approval_resolved", approvalId, approved });
      return true;
    }
    if (this.#profile.interaction.approval !== "suspend") return false;
    if (!this.#suspended.takeApproval(approvalId)) return false;
    this.#emit({ type: "approval_resolved", approvalId, approved });
    if (approved) await this.#prompt("The user approved the pending action. Retry it and continue.");
    return true;
  }

  async compact(instructions?: string) {
    await this.#require().compact(instructions);
  }

  /** Renames the session and says so on the wire, because a host draws the name from the session frame. */
  setName(name: string) {
    const clean = name.trim();
    if (!clean) return;
    this.#require().setSessionName(clean);
    this.#mailbox?.rename(clean, this.#profile.paths.root);
    this.#emit({ type: "session", info: this.info });
  }

  /** Copies the session file, not memory, under a new id: the file is what a resume replays. */
  fork(name?: string) {
    if (!this.#sessionDir) throw new Error("This profile keeps no sessions on disk, so there is nothing to fork");
    return CodeSessionFork.fork(this.#sessionDir, this.sessionId, name);
  }

  /** The reasoning levels this model offers, clamped by the engine to what the provider actually serves. */
  efforts(): CodeAgentEffort[] {
    const session = this.#session;
    if (!session?.supportsThinking()) return [];
    return session.getAvailableThinkingLevels();
  }

  setEffort(effort: CodeAgentEffort) {
    const session = this.#require();
    if (!session.supportsThinking()) throw new Error(`${session.model?.id ?? "this model"} does no reasoning`);
    // The engine clamps rather than refuses, so the frame that follows is the level that took, not the one asked.
    session.setThinkingLevel(effort);
    this.#emit({ type: "session", info: this.info });
  }

  /** Every registered provider, keyed or not — `getAvailable()` would list only what is already reachable. */
  catalogue(): CodeAgentProviderInfo[] {
    const runtime = this.#session?.modelRuntime;
    if (!runtime) return [];
    const current = this.#session?.model;
    return runtime
      .getProviders()
      .map((provider) => ({
        id: provider.id,
        name: provider.name ?? provider.id,
        authorized: runtime.hasConfiguredAuth(provider.id),
        models: (runtime.getModels(provider.id) ?? []).map((model) => ({
          id: model.id,
          name: model.name,
          ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
          current: model.provider === current?.provider && model.id === current?.id,
        })),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async setModel(ref: CodeAgentModelRef) {
    const session = this.#require();
    const model = await akanCodeModel(session.modelRuntime, ref);
    if (!model) throw new Error(`Unknown model: ${ref.provider}/${ref.id}`);
    await session.setModel(model);
    for (const message of this.#fitAutoCompact(this.#autoCompactAt))
      this.#emit({ type: "notice", level: "warning", message });
    this.#emit({ type: "session", info: this.info });
  }

  setAutoCompactAt(percent: number | undefined) {
    const wanted = AkanCodeCompaction.normalize(percent);
    const problem = this.#autoCompactProblem(wanted);
    if (problem) throw new Error(problem);
    this.#autoCompactAt = wanted;
    this.#applyAutoCompact();
    this.#emit({ type: "session", info: this.info });
  }

  // A share that fit one window can fall under the kept turns of a smaller one, and would compact every turn.
  #fitAutoCompact(percent: number | undefined) {
    const problem = this.#autoCompactProblem(percent);
    this.#autoCompactAt = problem ? undefined : percent;
    this.#applyAutoCompact();
    return problem ? [`${problem} Autocompact is back to the default.`] : [];
  }

  #autoCompactProblem(percent: number | undefined) {
    const session = this.#require();
    const model = session.model;
    if (!model || !percent) return undefined;
    const { keepRecentTokens } = session.settingsManager.getCompactionSettings(model);
    return AkanCodeCompaction.problemOf(model, percent, keepRecentTokens);
  }

  // Never before `create` has built the session: `settingsManager.reload()` drops whatever `applyOverrides` set.
  #applyAutoCompact() {
    const session = this.#require();
    if (session.model) AkanCodeCompaction.apply(session.settingsManager, session.model, this.#autoCompactAt);
  }

  async waitForIdle() {
    await this.#require().waitForIdle();
  }

  dispose() {
    this.#mailbox?.close();
    if (this.#disposed) return;
    this.#disposed = true;
    this.#asks.clear();
    this.#listeners.clear();
    this.#disposePlugins?.();
    this.#session?.dispose();
  }

  async #attach(session: AgentSession, mode: CodeAgentHostMode) {
    this.#session = session;
    session.subscribe((event) => {
      for (const body of this.#mapper.map(event)) this.#emit(body);
      // Per turn, not per delta: the count only moves when a provider response lands.
      if (event.type === "agent_end" || event.type === "compaction_end") this.#emitContextNow();
    });
    await session.bindExtensions({
      mode,
      uiContext: this.#ui().context(),
      abortHandler: () => void session.abort(),
      onError: (error: unknown) => this.#emit({ type: "error", message: String(error), fatal: false }),
    });
  }

  /** A path is read here rather than by the host, so a browser and a terminal hand the core the same thing. */
  static async #attachments(images: CodeAgentImage[] | undefined) {
    if (!images?.length) return [];
    return await Promise.all(
      images.map(async (image) => {
        if ("data" in image) return { type: "image" as const, data: image.data, mimeType: image.mime };
        const file = Bun.file(image.path);
        return {
          type: "image" as const,
          data: Buffer.from(await file.arrayBuffer()).toString("base64"),
          mimeType: file.type || "image/png",
        };
      }),
    );
  }

  // Also on resume, or a session reopened at 80% shows no usage until its next turn ends.
  #emitContextNow() {
    const usage = this.#session?.getContextUsage();
    // `== null` on purpose: typed `number | null`, but `undefined` must not emit `used: undefined`.
    if (usage?.tokens == null) return;
    if (usage.tokens === this.#lastContextTokens) return;
    this.#lastContextTokens = usage.tokens;
    this.#emit({ type: "context", used: usage.tokens, max: usage.contextWindow || undefined });
  }

  #require() {
    if (!this.#session) throw new Error("CodeAgent is not started");
    return this.#session;
  }

  #emit(body: CodeAgentEventBody) {
    this.#seq += 1;
    const event = { ...body, seq: this.#seq } as CodeAgentEvent;
    this.#remember(event);
    for (const listener of this.#listeners) listener(event);
  }

  #remember(event: CodeAgentEvent) {
    if (event.type === "idle") {
      this.#replay.length = 0;
      this.#replayFrom = event.seq;
      return;
    }
    this.#replay.push(event);
    while (this.#replay.length > CodeAgent.replayLimit) {
      const dropped = this.#replay.shift();
      this.#replayFrom = dropped?.seq ?? this.#replayFrom;
    }
  }

  #gateExtension(): InlineExtension {
    return {
      name: "akan-profile-gate",
      factory: (pi: ExtensionAPI) => {
        pi.on("tool_call", async (event) => {
          const verdict = this.#gate.verdict(event.toolName, event.input);
          if (verdict.block) return this.#refuse(event.toolCallId, event.toolName, event.input, verdict.block);
          if (!verdict.approval) return undefined;
          const approved = await this.#requestApproval(event.toolCallId, event.toolName, event.input, verdict.approval);
          if (approved) return undefined;
          return this.#refuse(event.toolCallId, event.toolName, event.input, "The user declined this action.");
        });
      },
    };
  }

  #refuse(toolCallId: string, toolName: string, args: unknown, reason: string) {
    for (const body of this.#mapper.markBlocked(toolCallId, toolName, args, reason)) this.#emit(body);
    return { block: true, reason };
  }

  async #requestApproval(toolCallId: string, name: string, args: unknown, summary: string) {
    // Nobody to ask means nobody to refuse: a pod would otherwise deny every write it was created to make.
    if (!this.#profile.ui.canPrompt) return true;
    const approvalId = this.#asks.nextId("a");
    const request = {
      approvalId,
      toolCallId,
      name,
      summary: codeAgentClip(summary, codeAgentLabelChars),
      policy: this.#profile.approval,
    };
    this.#emit({ type: "approval", request });
    if (this.#profile.interaction.approval === "suspend") {
      this.#suspended.addApproval(request);
      this.#mapper.noteOutcome("awaiting");
      return false;
    }
    return await this.#asks.openApproval(approvalId);
  }

  /** The rendered answer; `undefined` when skipped, suspended, or nobody can be prompted. */
  async ask(spec: Omit<CodeAgentQuestion, "questionId">) {
    const question: CodeAgentQuestion = { questionId: this.#asks.nextId("q"), ...spec };
    if (!this.#profile.ui.canPrompt) {
      this.#emit({ type: "question_skipped", question, reason: "no-host" });
      return undefined;
    }
    this.#emit({ type: "question", question });
    if (this.#profile.interaction.question === "suspend") {
      this.#suspended.setQuestion(question);
      this.#mapper.noteOutcome("awaiting");
      return undefined;
    }
    return (await this.#asks.openQuestion(question)) || undefined;
  }

  #ui() {
    return new CodeAgentUi({
      ask: async (prompt, kind, choices) =>
        await this.ask({
          prompt,
          kind,
          ...(choices ? { options: choices.map((label) => ({ key: label, label })) } : {}),
          freeText: kind === "text",
        }),
      notify: (level, message) => this.#emit({ type: "notice", level, message }),
    });
  }
}
