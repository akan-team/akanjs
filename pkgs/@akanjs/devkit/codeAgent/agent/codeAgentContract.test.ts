import { describe, expect, test } from "bun:test";
import {
  CodeAgentClient,
  type CodeAgentEvent,
  type CodeAgentQuestion,
  type CodeAgentToolSummary,
  type CodeAgentTransport,
  codeAgentEventLabel,
  codeAgentEventPersistence,
  codeAgentPresets,
  codeAgentShouldPersist,
  isCodeAgentPresetName,
} from "akanjs/common";
import { akanCodeModelWarnings } from "./akanCodeModel";
import { CodeAgentAsks } from "./CodeAgentAsks";
import { CodeAgentEventMapper } from "./CodeAgentEventMapper";
import { CodeAgentGate } from "./CodeAgentGate";
import { CodeAgentStreamPrinter } from "./CodeAgentStreamPrinter";

const root = "/tmp/akan-code-test";

class FakeTransport implements CodeAgentTransport {
  sent: string[] = [];
  #handler: (line: string) => void = () => {};
  send(line: string) {
    this.sent.push(line);
  }
  onLine(handler: (line: string) => void) {
    this.#handler = handler;
  }
  deliver(frame: unknown) {
    this.#handler(JSON.stringify(frame));
  }
}

const event = (seq: number, body: Partial<CodeAgentEvent> = {}) => ({ type: "idle", seq, ...body }) as CodeAgentEvent;

describe("CodeAgentClient", () => {
  test("correlates a reply with the command that asked for it", async () => {
    const transport = new FakeTransport();
    const client = new CodeAgentClient(transport);
    const promise = client.send({ type: "get_state" });
    const request = JSON.parse(transport.sent[0] ?? "{}") as { id: string };
    transport.deliver({ type: "reply", id: request.id, ok: true, data: { sessionId: "s1" } });
    expect(await promise).toEqual({ sessionId: "s1" });
  });

  test("rejects when the core reports the command failed", async () => {
    const transport = new FakeTransport();
    const client = new CodeAgentClient(transport);
    const promise = client.send({ type: "abort" });
    const request = JSON.parse(transport.sent[0] ?? "{}") as { id: string };
    transport.deliver({ type: "reply", id: request.id, ok: false, error: "nothing running" });
    await expect(promise).rejects.toThrow("nothing running");
  });

  test("drops a replayed frame and keeps the watermark monotonic", () => {
    const transport = new FakeTransport();
    const client = new CodeAgentClient(transport);
    const seen: number[] = [];
    client.on((e) => seen.push(e.seq));
    for (const seq of [1, 2, 2, 1, 3]) transport.deliver({ type: "event", event: event(seq) });
    expect(seen).toEqual([1, 2, 3]);
    expect(client.lastSeq).toBe(3);
  });

  test("a new session resets the watermark, or its first frames read as duplicates", () => {
    const transport = new FakeTransport();
    const client = new CodeAgentClient(transport);
    const seen: number[] = [];
    client.on((e) => seen.push(e.seq));
    transport.deliver({ type: "event", event: event(7) });
    client.resetSeq();
    transport.deliver({ type: "event", event: event(1) });
    expect(seen).toEqual([7, 1]);
  });

  test("ignores a line that is not a frame instead of tearing the stream down", () => {
    const transport = new FakeTransport();
    const client = new CodeAgentClient(transport);
    const seen: number[] = [];
    client.on((e) => seen.push(e.seq));
    transport.deliver("not json" as unknown);
    client.push('{"type":"event","event":{"type":"idle","seq":1}}\n');
    expect(seen).toEqual([1]);
  });
});

describe("codeAgentPresets", () => {
  test("review gives no write, bash or web tools", () => {
    const profile = codeAgentPresets.review(root);
    expect(profile.tools.builtin).toEqual(["read", "ls", "grep", "find"]);
    expect(profile.tools.web).toEqual({ fetch: false, search: false });
    expect(profile.context.projectFiles).toBe(false);
  });

  test("a pod cannot prompt and therefore suspends both interactions", () => {
    const profile = codeAgentPresets.pod(root);
    expect(profile.ui.canPrompt).toBe(false);
    expect(profile.interaction).toEqual({ question: "suspend", approval: "suspend" });
  });

  test("web asks before writing even though the runner is isolated", () => {
    expect(codeAgentPresets.web(root).approval).toBe("writes");
    expect(codeAgentPresets.local(root).approval).toBe("never");
  });

  test("every preset denies env files and secrets", () => {
    for (const name of ["local", "pod", "review", "web"] as const)
      expect(codeAgentPresets[name](root).paths.deny).toContain("**/.env");
  });

  test("MCP discovery is on where a person is driving and off where nobody vetted the server", () => {
    expect(codeAgentPresets.local(root).tools.mcp).toEqual([]);
    expect(codeAgentPresets.web(root).tools.mcp).toEqual([]);
    expect(codeAgentPresets.review(root).tools.mcp).toBe("off");
    expect(codeAgentPresets.pod(root).tools.mcp).toBe("off");
  });

  test("isCodeAgentPresetName refuses an unknown name", () => {
    expect(isCodeAgentPresetName("local")).toBe(true);
    expect(isCodeAgentPresetName("prod")).toBe(false);
  });
});

describe("CodeAgentGate", () => {
  test("blocks a path on the deny list", () => {
    const gate = new CodeAgentGate(codeAgentPresets.local(root));
    expect(gate.verdict("read", { path: ".env" }).block).toContain("deny list");
    expect(gate.verdict("read", { path: "apps/a/secrets/token.json" }).block).toContain("deny list");
  });

  test("blocks a path that escapes the agent root", () => {
    const gate = new CodeAgentGate(codeAgentPresets.local(root));
    expect(gate.verdict("read", { path: "../../etc/passwd" }).block).toContain("outside the agent root");
    expect(gate.verdict("read", { path: "/etc/passwd" }).block).toContain("outside the agent root");
  });

  test("lets an ordinary path through", () => {
    const gate = new CodeAgentGate(codeAgentPresets.local(root));
    expect(gate.verdict("read", { path: "apps/a/lib/post/post.service.ts" })).toEqual({});
  });

  test("approval:writes asks for write and edit only", () => {
    const gate = new CodeAgentGate(codeAgentPresets.web(root));
    expect(gate.verdict("write", { path: "a.ts" }).approval).toBe("write a.ts");
    expect(gate.verdict("edit", { path: "a.ts" }).approval).toBe("edit a.ts");
    expect(gate.verdict("read", { path: "a.ts" }).approval).toBeUndefined();
    expect(gate.verdict("bash", { command: "ls" }).approval).toBeUndefined();
  });

  test("approval:commands summarises the command it is asking about", () => {
    const profile = { ...codeAgentPresets.local(root), approval: "commands" as const };
    const gate = new CodeAgentGate(profile);
    expect(gate.verdict("bash", { command: "rm -rf build" }).approval).toBe("run: rm -rf build");
  });

  test("an allow list narrows further than the root", () => {
    const profile = codeAgentPresets.local(root);
    const gate = new CodeAgentGate({ ...profile, paths: { ...profile.paths, allow: ["apps/**"] } });
    expect(gate.verdict("read", { path: "apps/a/x.ts" }).block).toBeUndefined();
    expect(gate.verdict("read", { path: "libs/b/x.ts" }).block).toContain("allow list");
  });
});

describe("CodeAgentAsks", () => {
  const questionOf = (questionId: string): CodeAgentQuestion => ({
    questionId,
    prompt: "which colour?",
    kind: "select",
    options: [
      { key: "teal", label: "Teal" },
      { key: "rose", label: "Rose" },
    ],
  });

  test("answers the pending question and ignores a stale id", async () => {
    const asks = new CodeAgentAsks();
    const id = asks.nextId("q");
    const promise = asks.openQuestion(questionOf(id));
    expect(asks.answer("q99", "wrong")).toBe(false);
    expect(asks.answer(id, "teal")).toBe(true);
    expect(await promise).toBe("teal");
    expect(asks.answer(id, "again")).toBe(false);
  });

  test("approvals are a queue, so two in a row both resolve", async () => {
    const asks = new CodeAgentAsks();
    const first = asks.nextId("a");
    const second = asks.nextId("a");
    const promises = [asks.openApproval(first), asks.openApproval(second)];
    asks.resolveApproval(second, false);
    asks.resolveApproval(first, true);
    expect(await Promise.all(promises)).toEqual([true, false]);
  });

  test("clearing resolves everything so no caller is stranded", async () => {
    const asks = new CodeAgentAsks();
    const question = asks.openQuestion(questionOf(asks.nextId("q")));
    const approval = asks.openApproval(asks.nextId("a"));
    asks.clear();
    expect(await question).toBe("");
    expect(await approval).toBe(false);
    expect(asks.pendingQuestionId).toBeUndefined();
    expect(asks.hasPendingApproval).toBe(false);
  });
});

describe("CodeAgentEventMapper", () => {
  const start = { type: "agent_start" } as never;

  test("a run becomes one turn, not one turn per round trip", () => {
    const mapper = new CodeAgentEventMapper();
    expect(mapper.map(start)).toEqual([{ type: "turn_start", turnId: "t1" }]);
    expect(mapper.map({ type: "turn_start" } as never)).toEqual([]);
    expect(mapper.map(start)).toEqual([{ type: "turn_start", turnId: "t2" }]);
  });

  test("streams text and thinking deltas apart", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    const text = mapper.map({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "hi" },
    } as never);
    const think = mapper.map({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "hmm" },
    } as never);
    expect(text).toEqual([{ type: "text_delta", turnId: "t1", text: "hi" }]);
    expect(think).toEqual([{ type: "thinking_delta", turnId: "t1", text: "hmm" }]);
  });

  /**
   * `String({})` is `"[object Object]"`, and an `edit` call's argument is an array of them — so a row that
   * should read "three replacements" read as two identical placeholders instead.
   */
  test("a structured argument is described by its shape, not stringified", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    const [event] = mapper.map({
      type: "tool_execution_start",
      toolCallId: "c1",
      toolName: "edit",
      args: { path: "/repo/a.ts", edits: [{ old: "x" }, { old: "y" }], options: { dryRun: false } },
    } as never);
    const title = event?.type === "tool_start" ? event.tool.title : "";
    expect(title).not.toContain("[object Object]");
    expect(title).toContain("edits=2 items");
    expect(title).toContain("options={1 key}");
    // A path still reads as itself: it is the one argument worth showing verbatim.
    expect(title).toContain("path=/repo/a.ts");
  });

  test("a blocked call gets a start frame and the engine's end frame is relabelled once", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    const tool: CodeAgentToolSummary = {
      toolCallId: "c1",
      name: "read",
      op: "read",
      path: ".env",
      title: "read(path=.env)",
    };
    expect(mapper.markBlocked("c1", "read", { path: ".env" }, "denied")).toEqual([
      { type: "tool_start", turnId: "t1", tool },
    ]);
    const ended = mapper.map({
      type: "tool_execution_end",
      toolCallId: "c1",
      toolName: "read",
      result: {},
      isError: true,
    } as never);
    expect(ended).toEqual([
      { type: "tool_end", turnId: "t1", tool, outcome: "blocked", output: "denied", truncated: false },
    ]);
    expect(mapper.flushBlocked()).toEqual([]);
  });

  test("a refusal the engine never closes is swept at the turn boundary", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    mapper.markBlocked("c2", "bash", { command: "rm" }, "denied");
    const frames = mapper.map({ type: "agent_end", messages: [], willRetry: false } as never);
    expect(frames.map((f) => f.type)).toEqual(["tool_end", "turn_end"]);
  });

  test("reports an aborted run as aborted rather than done", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    const frames = mapper.map({ type: "agent_end", messages: [{ stopReason: "aborted" }], willRetry: false } as never);
    expect(frames).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "aborted" }]);
  });

  test("a compaction that failed or was cancelled carries that, not just its reason", () => {
    const mapper = new CodeAgentEventMapper();
    const end = (fields: object) =>
      mapper.map({
        type: "compaction_end",
        reason: "threshold",
        result: undefined,
        willRetry: false,
        ...fields,
      } as never);
    expect(end({ aborted: false, errorMessage: "Auto-compaction failed: 529" })).toEqual([
      { type: "compaction", phase: "end", reason: "threshold", error: "Auto-compaction failed: 529" },
    ]);
    expect(end({ aborted: true })).toEqual([{ type: "compaction", phase: "end", reason: "threshold", aborted: true }]);
    expect(end({ aborted: false })).toEqual([{ type: "compaction", phase: "end", reason: "threshold" }]);
  });
});

describe("CodeAgentStreamPrinter", () => {
  const collect = (events: CodeAgentEvent[], json = false) => {
    const lines: string[] = [];
    const printer = new CodeAgentStreamPrinter({ json, write: (text) => lines.push(text) });
    for (const e of events) printer.print(e);
    printer.finish();
    return lines.join("");
  };

  test("closes a streamed line before printing a tool row", () => {
    const output = collect([
      { type: "text_delta", turnId: "t1", text: "working", seq: 1 },
      { type: "tool_start", turnId: "t1", tool: { toolCallId: "c1", name: "ls", op: "list", title: "ls" }, seq: 2 },
    ]);
    expect(output.split("\n")[0]).toBe("working");
    expect(output).toContain("ls");
  });

  test("json mode prints the event verbatim, one per line", () => {
    const output = collect([{ type: "idle", seq: 4 }], true);
    expect(JSON.parse(output)).toEqual({ type: "idle", seq: 4 });
  });

  test("hides thinking unless it was asked for", () => {
    const lines: string[] = [];
    const printer = new CodeAgentStreamPrinter({ write: (t) => lines.push(t) });
    printer.print({ type: "thinking_delta", turnId: "t1", text: "secret", seq: 1 });
    expect(lines.join("")).toBe("");
  });
});

describe("codeAgentEventLabel", () => {
  test("renders every event kind without throwing", () => {
    const events: CodeAgentEvent[] = [
      {
        type: "session",
        info: {
          sessionId: "s",
          cwd: root,
          profile: "local",
          model: undefined,
          tools: [],
          contextTokens: undefined,
          effort: undefined,
          name: undefined,
          interaction: { question: "await", approval: "await" },
        },
        seq: 1,
      },
      { type: "turn_start", turnId: "t1", seq: 2 },
      { type: "turn_end", turnId: "t1", stopReason: "done", seq: 3 },
      { type: "message", turnId: "t1", role: "assistant", text: "hi", seq: 4 },
      {
        type: "tool_end",
        turnId: "t1",
        tool: { toolCallId: "c", name: "ls", op: "list", title: "ls" },
        outcome: "blocked",
        output: "no",
        truncated: false,
        seq: 5,
      },
      { type: "question", question: { questionId: "q1", prompt: "which?", kind: "text" }, seq: 6 },
      { type: "host", kind: "preview", id: "p1", payload: { url: "http://localhost:8282" }, seq: 14 },
      {
        type: "approval",
        request: {
          approvalId: "a1",
          toolCallId: "c",
          name: "write",
          summary: "write a.ts",
          policy: "writes",
        },
        seq: 7,
      },
      { type: "compaction", phase: "start", reason: "threshold", seq: 8 },
      { type: "retry", attempt: 1, maxAttempts: 3, delayMs: 100, message: "overloaded", seq: 9 },
      { type: "queue", steering: [], followUp: ["x"], seq: 10 },
      { type: "notice", level: "warning", message: "careful", seq: 11 },
      { type: "error", message: "boom", fatal: true, seq: 12 },
      { type: "idle", seq: 13 },
    ];
    for (const e of events) expect(codeAgentEventLabel(e).length).toBeGreaterThan(0);
  });
});

describe("CodeAgentGate bash", () => {
  test("refuses a shell command that names a denied file", () => {
    const gate = new CodeAgentGate(codeAgentPresets.local(root));
    expect(gate.verdict("bash", { command: "cat .env" }).block).toContain(".env");
    expect(gate.verdict("bash", { command: "cat ../../.env" }).block).toContain(".env");
    expect(gate.verdict("bash", { command: "ls secrets/" }).block).toContain("secrets/");
    expect(gate.verdict("bash", { command: "openssl x509 -in server.pem" }).block).toContain(".pem");
  });

  test("leaves an ordinary command alone", () => {
    const gate = new CodeAgentGate(codeAgentPresets.local(root));
    expect(gate.verdict("bash", { command: "bun test --isolate" })).toEqual({});
    expect(gate.verdict("bash", { command: "grep -r TODO ." })).toEqual({});
  });
});

describe("codeAgentShouldPersist", () => {
  test("follows the table for engine frames", () => {
    expect(codeAgentShouldPersist({ type: "message", turnId: "t1", role: "assistant", text: "hi" })).toBe(true);
    expect(codeAgentShouldPersist({ type: "text_delta", turnId: "t1", text: "hi" })).toBe(false);
    expect(codeAgentShouldPersist({ type: "thinking_delta", turnId: "t1", text: "hm" })).toBe(false);
    expect(codeAgentShouldPersist({ type: "error", message: "boom", fatal: false })).toBe(true);
  });

  test("a host frame decides per frame, not per kind", () => {
    const running = { type: "host" as const, kind: "step", id: "s1", payload: { status: "pending" } };
    const done = { type: "host" as const, kind: "step", id: "s1", persist: true, payload: { status: "done" } };
    expect(codeAgentShouldPersist(running)).toBe(false);
    expect(codeAgentShouldPersist(done)).toBe(true);
  });

  test("the table answers every event type", () => {
    const types = Object.keys(codeAgentEventPersistence);
    expect(types).toContain("host");
    expect(types.every((type) => ["live", "persist"].includes(codeAgentEventPersistence[type as never]))).toBe(true);
  });
});

describe("turn outcome", () => {
  const start = { type: "agent_start" } as never;
  const finished = (stopReason: string) =>
    ({ type: "agent_end", messages: [{ stopReason }], willRetry: false }) as never;

  test("an abort is reported even though the engine calls it a normal stop", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    mapper.noteOutcome("aborted");
    expect(mapper.map(finished("stop"))).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "aborted" }]);
  });

  test("suspending to ask a person ends the turn as awaiting", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    mapper.noteOutcome("awaiting");
    expect(mapper.map(finished("stop"))).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "awaiting" }]);
  });

  test("the note is consumed once and never colours the next turn", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    mapper.noteOutcome("aborted");
    mapper.map(finished("stop"));
    mapper.map(start);
    expect(mapper.map(finished("stop"))).toEqual([{ type: "turn_end", turnId: "t2", stopReason: "done" }]);
  });

  test("a note left by an abort that hit an idle session is dropped at the next turn", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.noteOutcome("aborted");
    mapper.map(start);
    expect(mapper.map(finished("stop"))).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "done" }]);
  });

  test("falls back to the engine when the core noted nothing", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    expect(mapper.map(finished("error"))).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "error" }]);
  });
});

describe("truncation", () => {
  const start = { type: "agent_start" } as never;

  test("the engine's `length` is a partial success, not a completed turn", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    const frames = mapper.map({
      type: "agent_end",
      messages: [{ stopReason: "length" }],
      willRetry: false,
    } as never);
    expect(frames).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "truncated" }]);
  });

  test("an abort still wins over the engine's report", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    mapper.noteOutcome("aborted");
    const frames = mapper.map({ type: "agent_end", messages: [{ stopReason: "length" }], willRetry: false } as never);
    expect(frames).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "aborted" }]);
  });

  test("the terminal says so, because a cut answer looks like a finished one", () => {
    const lines: string[] = [];
    const printer = new CodeAgentStreamPrinter({ write: (text) => lines.push(text) });
    printer.print({ type: "turn_end", turnId: "t1", stopReason: "done", seq: 1 });
    expect(lines.join("")).toBe("");
    printer.print({ type: "turn_end", turnId: "t1", stopReason: "truncated", seq: 2 });
    expect(lines.join("")).toContain("cut off");
  });
});

describe("akanCodeModelWarnings", () => {
  const model = (contextWindow: number) =>
    ({ provider: "custom", id: "m", contextWindow }) as unknown as Parameters<typeof akanCodeModelWarnings>[0];

  test("says so when the window cannot hold the compaction policy", () => {
    expect(akanCodeModelWarnings(model(8_192), 36_384)[0]).toContain("compact immediately");
  });

  test("stays quiet for an ordinary small-output model", () => {
    expect(akanCodeModelWarnings(model(128_000), 36_384)).toEqual([]);
  });

  test("no model is not a warning", () => {
    expect(akanCodeModelWarnings(undefined, 36_384)).toEqual([]);
  });
});

describe("wire coverage", () => {
  /**
   * The audit that found `context` declared, rendered, and never emitted. A contract entry with no producer
   * costs every host a branch for a frame that cannot arrive.
   */
  test("every event type either has a producer in the core or is documented as host-supplied", async () => {
    const dir = import.meta.dir;
    const sources = await Promise.all(
      ["CodeAgent.ts", "CodeAgentEventMapper.ts"].map(async (file) => await Bun.file(`${dir}/${file}`).text()),
    );
    const core = sources.join("\n");
    // `host` is the one frame the core never makes: it is the slot a host fills with its own vocabulary.
    const hostSupplied = new Set(["host"]);
    const missing = Object.keys(codeAgentEventPersistence).filter(
      (type) => !hostSupplied.has(type) && !core.includes(`type: "${type}"`),
    );
    expect(missing).toEqual([]);
  });
});
