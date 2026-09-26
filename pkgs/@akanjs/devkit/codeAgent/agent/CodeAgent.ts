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

/**
 * What the engine calls a run mode. It is not re-exported from the package entry, so the literal set is
 * restated here; it is the whole type, and a mismatch is a type error at the one call site that uses it.
 */
export type CodeAgentHostMode = "tui" | "rpc" | "json" | "print";

export interface CodeAgentOptions {
  workspace: Workspace;
  cwd?: string;
  profile: CodeAgentProfile;
  model?: CodeAgentModelRef;
  /** Apps whose dev server and preview the turn-end feedback loop watches. */
  apps?: string[];
  /** Extra capability packs, layered on top of the profile gate and the akan pack. */
  extensions?: InlineExtension[];
  customTools?: ToolDefinition[];
  /** `print` for a one-shot stream, `rpc` when a host drives this process over stdio. */
  mode?: CodeAgentHostMode;
  /** How many `task` tools deep this agent already is. A sub-agent is created one level down. */
  depth?: number;
  /** Id of a stored session to continue instead of opening a new one. */
  resume?: string;
}

/**
 * The code agent core: one engine session, gated by a profile, emitting the akan wire.
 *
 * Nothing here knows what a host is. A host receives events, sends commands and injects a profile — which is
 * what lets one core serve a terminal, an RPC child and a browser without three copies of the loop.
 */
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
  /**
   * The frames of the turn in flight, so a host that reconnects mid-turn can be handed what it missed.
   *
   * Bounded and cleared at `idle`: the completed messages of an earlier turn are in the transcript, and the
   * only thing that exists nowhere else is the bubble still being written.
   */
  readonly #replay: CodeAgentEvent[] = [];
  #replayFrom = 0;
  #lastContextTokens: number | undefined;

  private constructor(profile: CodeAgentProfile) {
    this.#profile = profile;
    this.#gate = new CodeAgentGate(profile);
  }

  static async create(options: CodeAgentOptions) {
    const workspaceRoot = options.workspace.workspaceRoot;
    const cwd = options.cwd ?? workspaceRoot;
    const agent = new CodeAgent(options.profile);
    const settingsManager = AkanCodeServices.settings();
    const modelRuntime = await AkanCodeServices.runtime(workspaceRoot, CodeAgentProxy.fromEnv(options.profile));
    const model = await akanCodeModel(modelRuntime, options.model);
    const compaction = settingsManager.getCompactionSettings(model);
    const modelWarnings = akanCodeModelWarnings(model, compaction.reserveTokens + compaction.keepRecentTokens);

    const akan = await AkanCodePlugins.build({
      workspace: options.workspace,
      cwd,
      profile: options.profile,
      apps: options.apps ?? [],
      canSeeImages: akanCodeModelSupportsImages(model),
      depth: options.depth ?? 0,
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
    agent.#suspended = new CodeAgentSuspended(CodeAgentSuspended.fileOf(agent.#sessionDir, agent.sessionId));
    if (agent.#sessionDir && options.profile.session.store === "file")
      agent.#openMail(akanCodePaths.mailDir(workspaceRoot), cwd);
    for (const message of modelWarnings) agent.#emit({ type: "notice", level: "warning", message });
    return agent;
  }

  get profile() {
    return this.#profile;
  }

  /** Whether the model can be handed a picture at all, which decides whether offering to attach one is honest. */
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
   * The MCP servers this session was built against, and what each one published.
   *
   * Read from the assembly rather than from the live session: the tool allowlist is fixed when the session is
   * created, so a server declared afterwards is not one this agent can reach however the file now reads.
   */
  mcpServers(): CodeAgentMcpStatus[] {
    return this.#mcp;
  }

  /** The other `akan code` sessions running in this workspace right now. */
  peers() {
    return this.#mailbox?.peers() ?? [];
  }

  /**
   * Hands a message to another session, which receives it as a prompt of its own.
   *
   * It is a prompt rather than a note on its screen because the point of reaching another session is to set
   * it working — and it goes in as a follow-up, so a peer in the middle of a turn finishes that turn first.
   */
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
      void this.prompt(`Message from another session — ${from}:\n${mail.text}`).catch((error: unknown) =>
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

  /** Total tokens this session has spent, which is what a sub-agent budget is drawn down against. */
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
      // A model that does no reasoning has no level to report, and `off` is a level — one of them is a
      // capability and the other is a setting, so they cannot share a spelling.
      effort: session.supportsThinking() ? session.thinkingLevel : undefined,
      name: session.sessionName,
      interaction: this.#profile.interaction,
    };
  }

  /**
   * Emits the opening `session` frame through the same counter as everything else.
   *
   * A frame minted outside it would carry `seq: 0`, which every client drops — their watermark starts there.
   */
  announce() {
    this.#emit({ type: "session", info: this.info });
    this.#restore();
    //* A resumed worker says again what it is still waiting on, or a host that reattached has no card to answer.
    const { question, approvals } = this.#suspended;
    if (question) this.#emit({ type: "question", question });
    for (const request of approvals) this.#emit({ type: "approval", request });
  }

  /**
   * Replays a resumed session's conversation onto the wire.
   *
   * The model gets its context back from the session file; a host gets nothing, because the wire only carries
   * what happens live. Without this a resumed session is a blank screen in front of an agent that remembers
   * everything — which reads as a resume that failed.
   *
   * Prose only: the tool traffic of a past turn is in the file, but replaying it would redraw calls nobody is
   * waiting on, against a working tree that has moved since.
   */
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

  /**
   * Current state, and the frames after `sinceSeq` when a reconnecting host asks for them.
   *
   * `replayFrom` says how far back the buffer reaches. A client behind it cannot be caught up frame by frame
   * and has to reload — saying so is better than silently handing it a gap.
   */
  async state({ sinceSeq }: { sinceSeq?: number } = {}): Promise<CodeAgentState> {
    const base = { info: this.info, streaming: this.isStreaming, replayFrom: this.#replayFrom };
    if (sinceSeq === undefined) return base;
    return { ...base, frames: this.#replay.filter((event) => event.seq > sinceSeq) };
  }

  async prompt(message: string, images?: CodeAgentImage[]) {
    const session = this.#require();
    // Named from the first thing asked of it, not from the answer: the name is derived, so waiting for the
    // turn to end would only mean the session is nameless for exactly as long as it is interesting to watch.
    if (!session.sessionName && message.trim()) this.setName(codeAgentSessionName(message));
    const attachments = await CodeAgent.#attachments(images);
    const options = attachments.length ? { images: attachments } : {};
    if (session.isStreaming) return await session.prompt(message, { ...options, streamingBehavior: "followUp" });
    await session.prompt(message, { ...options, source: "extension" });
  }

  async abort() {
    // The engine finalizes an interrupted message as an ordinary stop, so the only party that knows this was
    // an abort is the one that asked for it.
    this.#mapper.noteOutcome("aborted");
    this.#asks.clear();
    await this.#require().abort();
  }

  /**
   * Answering is not prompting. Routing an answer through `prompt` would open a turn while the question slot is
   * still filled, leaving a card on screen that still looks clickable — the library does not stop that.
   */
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
    // The answer has to reach the model as prose: compaction and the next turn read message content only, so
    // an answer that exists solely as structure is one the agent will not remember being given.
    await this.prompt(`The user answered: ${suspendedRendered}\nContinue the task.`);
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
    if (approved) await this.prompt("The user approved the pending action. Retry it and continue.");
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

  /**
   * Copies this session under a new id, so the conversation can be continued two ways.
   *
   * The copy is taken off disk rather than out of memory: the file is what a resume replays, so forking it is
   * the only version of "the same conversation" that both agents will actually agree on.
   */
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

  /**
   * The model catalogue, as the two questions a person actually asks of it.
   *
   * Built from the registry rather than `getAvailable()` so it needs no await and can answer about a provider
   * nobody has a key for: "what else could I run" is most of why the list is opened, and a list of only what
   * is already reachable cannot answer it.
   */
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
    this.#emit({ type: "session", info: this.info });
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
      this.#emitContextUsage(event.type);
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

  /**
   * Reports how full the window is, once per turn and after a compaction.
   *
   * Per turn rather than per delta: the number moves only when a provider response lands, and a frame per
   * token delta would be thousands of frames saying the same thing. `tokens` is null right after a compaction
   * and before the next response — that is "unknown", not zero, so nothing is emitted for it.
   */
  #emitContextUsage(eventType: string) {
    if (eventType !== "agent_end" && eventType !== "compaction_end") return;
    this.#emitContextNow();
  }

  /**
   * The same frame, on demand, for the one moment the window is already full and no turn has run.
   *
   * A resumed session restores a conversation the model is carrying and the host has never seen, so without
   * this the status line offers the declared window and no share of it until the next turn ends — a session
   * reopened at 80% looks identical to one reopened empty.
   */
  #emitContextNow() {
    const usage = this.#session?.getContextUsage();
    // `== null`, not `=== null`: the field is typed `number | null`, and a strict null check sails straight
    // past an `undefined` the way the mirror of this bug does — which would emit `used: undefined`.
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

  /**
   * Puts one question on the wire and waits for its answer, rendered as the labels a person chose.
   *
   * The single way anything asks: the engine's own UI port and the `ask_user` tool both land here, so the
   * suspend path, the profile's refusal to prompt at all, and the id the host answers against cannot disagree
   * between them. An empty answer is a skip, which is a real answer and not a failure.
   */
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
