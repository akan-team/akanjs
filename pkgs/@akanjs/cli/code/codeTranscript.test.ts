import { describe, expect, test } from "bun:test";
import {
  type CodeAgentEvent,
  type CodeAgentEventBody,
  type CodeAgentEventType,
  type CodeAgentSessionInfo,
  type CodeAgentToolSummary,
  CodeTranscript,
  codeAgentEventPersistence,
} from "akanjs/common";
import { CodeTuiLines } from "./CodeTuiLines";
import { CodeTuiParts } from "./CodeTuiParts";

const info: CodeAgentSessionInfo = {
  sessionId: "s1",
  cwd: "/repo",
  profile: "local",
  model: { provider: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  tools: ["read", "bash"],
  contextTokens: 1_000_000,
  effort: "medium",
  name: undefined,
  interaction: { question: "await", approval: "await" },
};

const tool = (toolCallId: string, title: string): CodeAgentToolSummary => ({
  toolCallId,
  name: "read",
  op: "read",
  title,
});

const drawn = (transcript: CodeTranscript, width = 200) =>
  CodeTuiParts.lines(transcript.parts, width).map((line) => CodeTuiLines.text(line));

const feed = (transcript: CodeTranscript, bodies: CodeAgentEventBody[]) => {
  let seq = 0;
  for (const body of bodies) {
    seq += 1;
    transcript.apply({ ...body, seq } as CodeAgentEvent);
  }
  return transcript;
};

describe("CodeTranscript", () => {
  test("a streamed answer is one part, finalized by the message that follows it", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "turn_start", turnId: "t1" },
      { type: "text_delta", turnId: "t1", text: "Hel" },
      { type: "text_delta", turnId: "t1", text: "lo" },
      { type: "message", turnId: "t1", role: "assistant", text: "Hello there" },
      { type: "turn_end", turnId: "t1", stopReason: "done" },
    ]);
    const assistant = transcript.parts.filter((part) => part.kind === "assistant");
    expect(assistant).toHaveLength(1);
    // The final message wins: a retried request streams the abandoned attempt's tokens too.
    expect(assistant[0]).toMatchObject({ text: "Hello there", streaming: false, truncated: false });
  });

  /**
   * The fold hazard this whole class was written around: the first tool call of a turn is index 0, and a
   * truthy check on the looked-up index sends its end frame down the append path.
   */
  test("the FIRST tool call of a turn is upserted, not appended twice", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "turn_start", turnId: "t1" },
      { type: "tool_start", turnId: "t1", tool: tool("c0", "read(a.ts)") },
      { type: "tool_end", turnId: "t1", tool: tool("c0", "read(a.ts)"), outcome: "ok", output: "", truncated: false },
    ]);
    const tools = transcript.parts.filter((part) => part.kind === "tool");
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ outcome: "ok" });
  });

  test("a second and third call keep their own rows", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "tool_start", turnId: "t1", tool: tool("c0", "read(a)") },
      { type: "tool_start", turnId: "t1", tool: tool("c1", "read(b)") },
      { type: "tool_end", turnId: "t1", tool: tool("c0", "read(a)"), outcome: "ok", output: "", truncated: false },
      {
        type: "tool_end",
        turnId: "t1",
        tool: tool("c1", "read(b)"),
        outcome: "error",
        output: "nope",
        truncated: false,
      },
    ]);
    const tools = transcript.parts.filter((part) => part.kind === "tool");
    expect(tools.map((part) => part.outcome)).toEqual(["ok", "error"]);
  });

  test("the end frame's summary replaces the start frame's, so a finished bash keeps its command", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "tool_start", turnId: "t1", tool: { toolCallId: "c0", name: "bash", op: "execute", title: "bash" } },
      {
        type: "tool_end",
        turnId: "t1",
        tool: { toolCallId: "c0", name: "bash", op: "execute", title: "bash: bun test" },
        outcome: "ok",
        output: "",
        truncated: false,
      },
    ]);
    expect(transcript.parts.filter((part) => part.kind === "tool")[0]?.tool.title).toBe("bash: bun test");
  });

  test("a blocked call is not an error, and it closes its own row", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "tool_start", turnId: "t1", tool: tool("c0", "read(.env)") },
      {
        type: "tool_end",
        turnId: "t1",
        tool: tool("c0", "read(.env)"),
        outcome: "blocked",
        output: "This profile cannot read .env.",
        truncated: false,
      },
    ]);
    const part = transcript.parts.filter((entry) => entry.kind === "tool")[0];
    expect(part?.outcome).toBe("blocked");
    const lines = CodeTuiParts.lines(transcript.parts, 80);
    expect(CodeTuiLines.text(lines[0] ?? { key: "", spans: [] })).toContain("⦸");
    expect(lines[0]?.spans[0]?.color).toBe("yellow");
  });

  test("a truncated turn says so, because a cut answer looks exactly like a finished one", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "turn_start", turnId: "t1" },
      { type: "text_delta", turnId: "t1", text: "half a sen" },
      { type: "turn_end", turnId: "t1", stopReason: "truncated" },
    ]);
    expect(transcript.parts.filter((part) => part.kind === "assistant")[0]?.truncated).toBe(true);
    expect(drawn(transcript).some((line) => line.includes("output limit"))).toBe(true);
  });

  test("an interrupted turn keeps the text it produced", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "turn_start", turnId: "t1" },
      { type: "text_delta", turnId: "t1", text: "partial" },
      { type: "turn_end", turnId: "t1", stopReason: "aborted" },
    ]);
    expect(transcript.parts.filter((part) => part.kind === "assistant")[0]).toMatchObject({
      text: "partial",
      truncated: false,
      streaming: false,
    });
    expect(transcript.stopReason).toBe("aborted");
  });

  test("a locally echoed prompt is not drawn twice when the engine echoes it back", () => {
    const transcript = new CodeTranscript();
    transcript.echo("add a comment module");
    feed(transcript, [{ type: "message", turnId: "t1", role: "user", text: "add a comment module" }]);
    expect(transcript.parts.filter((part) => part.kind === "user")).toHaveLength(1);
  });

  test("a feedback loop's own user message has no local echo and is shown", () => {
    const transcript = new CodeTranscript();
    transcript.echo("add a comment module");
    feed(transcript, [
      { type: "message", turnId: "t1", role: "user", text: "add a comment module" },
      { type: "message", turnId: "t2", role: "user", text: "typecheck failed: TS2322" },
    ]);
    expect(transcript.parts.filter((part) => part.kind === "user")).toHaveLength(2);
  });

  test("a question holds the slot until it is answered, and the answer lands on its own row", () => {
    const transcript = feed(new CodeTranscript(), [
      {
        type: "question",
        question: { questionId: "q1", prompt: "Which app?", kind: "select", options: [{ key: "a", label: "akan" }] },
      },
    ]);
    expect(transcript.question?.questionId).toBe("q1");
    feed(transcript, [{ type: "question_resolved", questionId: "q1", answer: { keys: ["a"] }, rendered: "akan" }]);
    expect(transcript.question).toBeUndefined();
    expect(drawn(transcript).some((line) => line.includes("= akan"))).toBe(true);
  });

  test("an approval holds its own slot and records the verdict", () => {
    const transcript = feed(new CodeTranscript(), [
      {
        type: "approval",
        request: { approvalId: "a1", toolCallId: "c0", name: "write", summary: "write a.ts", policy: "writes" },
      },
    ]);
    expect(transcript.approval?.approvalId).toBe("a1");
    feed(transcript, [{ type: "approval_resolved", approvalId: "a1", approved: false }]);
    expect(transcript.approval).toBeUndefined();
    expect(drawn(transcript).some((line) => line.includes("denied"))).toBe(true);
  });

  test("a host frame carrying an id is one row through its whole lifecycle", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "host", kind: "step", id: "s1", payload: "pending" },
      { type: "host", kind: "step", id: "s1", payload: "running" },
      { type: "host", kind: "step", id: "s1", payload: "done" },
    ]);
    const hosts = transcript.parts.filter((part) => part.kind === "host");
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.text).toBe("done");
  });

  test("a host frame with no id is a new row each time", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "host", kind: "note", payload: "one" },
      { type: "host", kind: "note", payload: "two" },
    ]);
    expect(transcript.parts.filter((part) => part.kind === "host")).toHaveLength(2);
  });

  test("context usage and the session line are both readable", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "session", info },
      { type: "context", used: 42_000, max: 1_000_000 },
    ]);
    expect(transcript.info?.model?.name).toBe("DeepSeek V4 Flash");
    expect(transcript.context).toEqual({ used: 42_000, max: 1_000_000 });
  });

  test("idle clears the queue and stops the spinner", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "turn_start", turnId: "t1" },
      { type: "queue", steering: ["a"], followUp: [] },
      { type: "idle" },
    ]);
    expect(transcript.streaming).toBe(false);
    expect(transcript.queue).toEqual({ steering: 0, followUp: 0 });
  });

  test("an automatic compaction that failed says so instead of claiming it compacted", () => {
    const notices = (end: Extract<CodeAgentEventBody, { type: "compaction" }>) =>
      feed(new CodeTranscript(), [{ type: "compaction", phase: "start", reason: end.reason }, end]).parts.flatMap(
        (part) => (part.kind === "notice" ? [`${part.level}: ${part.text}`] : []),
      );
    expect(
      notices({ type: "compaction", phase: "end", reason: "threshold", error: "Auto-compaction failed: 529" }),
    ).toEqual(["warning: Auto-compaction failed: 529"]);
    expect(notices({ type: "compaction", phase: "end", reason: "overflow", aborted: true })).toEqual([
      "info: Compaction cancelled.",
    ]);
    expect(notices({ type: "compaction", phase: "end", reason: "threshold" })).toEqual([
      "info: Compacted the conversation (threshold).",
    ]);
    // `/compact` throws to its caller, which reports it — a second line here would say the same thing twice.
    expect(notices({ type: "compaction", phase: "end", reason: "manual", error: "Compaction failed: x" })).toEqual([]);
  });

  /**
   * The checklist made into a test.
   *
   * Three times running, the contract carried a value with nowhere to draw it — `turn_end` unrendered,
   * `contextTokens` unrendered, `context` never emitted. A human checklist catches that once; the next person
   * does not run it.
   */
  test("every event in the contract changes something in the fold", () => {
    const samples: { [key in CodeAgentEventType]: CodeAgentEventBody } = {
      session: { type: "session", info },
      turn_start: { type: "turn_start", turnId: "t1" },
      turn_end: { type: "turn_end", turnId: "t1", stopReason: "truncated" },
      text_delta: { type: "text_delta", turnId: "t1", text: "x" },
      thinking_delta: { type: "thinking_delta", turnId: "t1", text: "x" },
      message: { type: "message", turnId: "t1", role: "assistant", text: "x" },
      tool_start: { type: "tool_start", turnId: "t1", tool: tool("c0", "read(a)") },
      tool_progress: { type: "tool_progress", turnId: "t1", toolCallId: "c0", text: "50%" },
      tool_end: {
        type: "tool_end",
        turnId: "t1",
        tool: tool("c0", "read(a)"),
        outcome: "ok",
        output: "",
        truncated: false,
      },
      question: { type: "question", question: { questionId: "q1", prompt: "?", kind: "text" } },
      question_resolved: { type: "question_resolved", questionId: "q1", answer: { text: "y" }, rendered: "y" },
      question_skipped: {
        type: "question_skipped",
        question: { questionId: "q2", prompt: "?", kind: "text" },
        reason: "no-host",
      },
      approval: {
        type: "approval",
        request: { approvalId: "a1", toolCallId: "c0", name: "write", summary: "s", policy: "writes" },
      },
      approval_resolved: { type: "approval_resolved", approvalId: "a1", approved: true },
      context: { type: "context", used: 1, max: 2 },
      subagent: {
        type: "subagent",
        agents: [{ id: "c0", kind: "explore", description: "reading the store", startedAt: 1, tokens: 2 }],
      },
      compaction: { type: "compaction", phase: "end", reason: "threshold" },
      retry: { type: "retry", attempt: 1, maxAttempts: 3, delayMs: 10, message: "429" },
      queue: { type: "queue", steering: ["a"], followUp: [] },
      notice: { type: "notice", level: "warning", message: "m" },
      error: { type: "error", message: "boom", fatal: false },
      idle: { type: "idle" },
      host: { type: "host", kind: "step", payload: "p" },
    };
    // Three of them are idempotent against the setup that makes the others meaningful, so those three are
    // probed with a second, different value rather than the same one twice.
    const probes: { [key in CodeAgentEventType]: CodeAgentEventBody } = {
      ...samples,
      session: { type: "session", info: { ...info, sessionId: "s2" } },
      tool_start: { type: "tool_start", turnId: "t1", tool: tool("c1", "read(b)") },
      queue: { type: "queue", steering: ["a", "b"], followUp: ["c"] },
    };
    const state = (transcript: CodeTranscript) =>
      JSON.stringify([
        transcript.parts,
        transcript.info,
        transcript.context,
        transcript.queue,
        transcript.subagents,
        transcript.streaming,
        transcript.compacting,
        transcript.stopReason,
      ]);
    const unread: string[] = [];
    for (const type of Object.keys(codeAgentEventPersistence) as CodeAgentEventType[]) {
      // The setup gives a resolution something to resolve and a queue for `idle` to clear; probing
      // `turn_start` needs the turn closed first, or there is no flag left for it to flip.
      const transcript = feed(new CodeTranscript(), [
        samples.session,
        samples.turn_start,
        samples.tool_start,
        samples.question,
        samples.approval,
        samples.queue,
        ...(type === "turn_start" ? [samples.idle] : []),
      ]);
      const before = state(transcript);
      feed(transcript, [probes[type]]);
      if (before === state(transcript)) unread.push(type);
    }
    expect(unread).toEqual([]);
  });
});

describe("assistant rendering", () => {
  test("markdown is rendered while it is still arriving, not only once the turn ends", () => {
    const transcript = feed(new CodeTranscript(), [
      { type: "turn_start", turnId: "t1" },
      { type: "text_delta", turnId: "t1", text: "## Results\n\n- **one** item" },
    ]);
    const lines = drawn(transcript);
    // No markers on screen: the reader spends most of an answer looking at this state.
    expect(lines.join("\n")).not.toContain("##");
    expect(lines.join("\n")).not.toContain("**");
    expect(lines).toContain("Results");
  });

  test("an unterminated fence is already a code block, so it does not change shape when it closes", () => {
    const open = feed(new CodeTranscript(), [{ type: "text_delta", turnId: "t1", text: "```ts\nconst a = 1;" }]);
    const closed = feed(new CodeTranscript(), [{ type: "text_delta", turnId: "t1", text: "```ts\nconst a = 1;\n```" }]);
    expect(drawn(open)).toEqual(drawn(closed));
  });
});

describe("CodeTui layout", () => {
  test("the rows always add up to the terminal, whatever the prompt or the question needs", async () => {
    const { CodeTui } = await import("./CodeTui");
    for (let terminalRows = 10; terminalRows <= 60; terminalRows += 1)
      for (const askRows of [1, 2, 5, 12, 40]) {
        const { ask, bodyHeight } = CodeTui.layout(terminalRows, askRows);
        // Ink overwrites rather than clips, so one row too many prints the prompt through its own content.
        expect(bodyHeight + ask + CodeTui.chromeRows).toBe(terminalRows);
        expect(bodyHeight).toBeGreaterThanOrEqual(CodeTui.minBodyRows);
        expect(ask).toBeLessThanOrEqual(askRows);
        expect(ask).toBeGreaterThanOrEqual(1);
      }
  });
});

/**
 * The two terminal hosts read the same wire, so a session replayed through both has to say the same things.
 *
 * Not the same bytes — one streams into a scrolling pane and the other appends to a log — but every fact a
 * user needs must survive both. This is the check that catches a host quietly dropping a field, which has
 * happened three times in this contract's short life.
 */
describe("printer and transcript agree", () => {
  test("the same session says the same things through both hosts", async () => {
    const { CodeAgentStreamPrinter } = await import("@akanjs/devkit/codeAgent/agent/CodeAgentStreamPrinter");
    const session: CodeAgentEventBody[] = [
      { type: "session", info },
      { type: "turn_start", turnId: "t1" },
      { type: "message", turnId: "t1", role: "user", text: "add a comment module" },
      { type: "tool_start", turnId: "t1", tool: tool("c0", "plan_workflow(create-module)") },
      {
        type: "tool_end",
        turnId: "t1",
        tool: tool("c0", "plan_workflow(create-module)"),
        outcome: "ok",
        output: "",
        truncated: false,
      },
      { type: "tool_start", turnId: "t1", tool: tool("c1", "read(.env)") },
      {
        type: "tool_end",
        turnId: "t1",
        tool: tool("c1", "read(.env)"),
        outcome: "blocked",
        output: "This profile cannot read .env.",
        truncated: false,
      },
      { type: "notice", level: "warning", message: "the dev server logged an error" },
      { type: "text_delta", turnId: "t1", text: "I planned the module" },
      { type: "turn_end", turnId: "t1", stopReason: "truncated" },
    ];
    let printed = "";
    const printer = new CodeAgentStreamPrinter({ write: (text) => (printed += text) });
    const transcript = new CodeTranscript();
    let seq = 0;
    for (const body of session) {
      seq += 1;
      const event = { ...body, seq } as CodeAgentEvent;
      printer.print(event);
      transcript.apply(event);
    }
    printer.finish();
    const plain = printed.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
    const rendered = [transcript.headline, ...drawn(transcript)].join("\n");
    for (const fact of [
      "DeepSeek V4 Flash",
      "1000k ctx",
      "plan_workflow(create-module)",
      "read(.env)",
      "the dev server logged an error",
      "I planned the module",
    ])
      for (const [host, text] of [
        ["printer", plain],
        ["transcript", rendered],
      ] as const)
        expect(`${host}: ${text.includes(fact)}`).toBe(`${host}: true`);
    // Both have to say the answer was cut off; neither may let it read as a finished one.
    expect(plain.toLowerCase()).toContain("cut off");
    expect(rendered.toLowerCase()).toContain("output limit");
  });
});
