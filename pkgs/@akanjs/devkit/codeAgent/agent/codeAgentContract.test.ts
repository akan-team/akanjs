import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
import { CodeAgentCommandLine } from "./CodeAgentCommandLine";
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
const start = { type: "agent_start" } as never;
const finished = (stopReason: string) => ({ type: "agent_end", messages: [{ stopReason }], willRetry: false }) as never;

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
  });

  test("local asks before a shell command and nothing else, and a pod asks about neither", () => {
    const local = new CodeAgentGate(codeAgentPresets.local(root));
    expect(local.verdict("bash", { command: "git status" }).approval).toBe("run: git status");
    expect(local.verdict("bash", { command: "curl https://example.com" }).strict).toBe(true);
    expect(local.verdict("write", { path: "a.ts" })).toEqual({});
    expect(local.verdict("read", { path: "a.ts" })).toEqual({});
    expect(new CodeAgentGate(codeAgentPresets.pod(root)).verdict("bash", { command: "git status" })).toEqual({});
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

  test("only the local profile asks before reaching a host off its list", () => {
    expect(codeAgentPresets.local(root).network.askOutside).toContain("github.com");
    for (const name of ["pod", "review", "web"] as const)
      expect(codeAgentPresets[name](root).network.askOutside).toBeUndefined();
  });

  test("isCodeAgentPresetName refuses an unknown name", () => {
    expect(isCodeAgentPresetName("local")).toBe(true);
    expect(isCodeAgentPresetName("prod")).toBe(false);
  });
});

const localUnasked = () => ({ ...codeAgentPresets.local(root), approval: "never" as const });

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

describe("CodeAgentGate allow for this session", () => {
  const gate = () => new CodeAgentGate(codeAgentPresets.local(root));
  const allow = (target: CodeAgentGate, names: string[]) => {
    target.allowed.offer("a0", names);
    target.allowed.settle("a0", true);
  };

  test("a command asks with the name a session answer would remember", () => {
    expect(gate().verdict("bash", { command: "git status --short" })).toEqual({
      approval: "run: git status --short",
      remember: ["git status"],
    });
  });

  test("an allowed command runs unasked, and another sub-command of its program still asks", () => {
    const local = gate();
    allow(local, ["git status", "bun test"]);
    expect(local.verdict("bash", { command: "git status" })).toEqual({});
    expect(local.verdict("bash", { command: "bun test --isolate ./a.test.ts" })).toEqual({});
    expect(local.verdict("bash", { command: "git diff" }).remember).toEqual(["git diff"]);
    expect(local.verdict("bash", { command: "bun x cowsay" }).remember).toEqual(["bun x"]);
  });

  test("a compound line runs unasked only once every command in it is allowed, and offers the ones that are not", () => {
    const local = gate();
    allow(local, ["bun test"]);
    const line = { command: "cd apps && bun test 2>&1 | tail -20" };
    expect(local.verdict("bash", line).remember).toEqual(["cd", "tail"]);
    allow(local, ["cd"]);
    expect(local.verdict("bash", line).remember).toEqual(["tail"]);
    allow(local, ["tail"]);
    expect(local.verdict("bash", line)).toEqual({});
    expect(local.verdict("bash", { command: "bun test && echo $(git log -1)" }).remember).toEqual(["git log", "echo"]);
  });

  test("a networking command, git push, rm and a command that runs another are asked every time with no session answer", () => {
    const local = gate();
    allow(local, [...CodeAgentCommandLine.alwaysAsked, "git", "ls", "echo"]);
    for (const command of [
      "curl https://example.com",
      "curl http://127.0.0.1:3000/health",
      "ls && ssh deploy@host",
      "git push",
      "git push origin main",
      "ls; rm -rf build",
      "sudo ls",
      "timeout 5 ls",
      "sh -c 'ls'",
      "ls | xargs echo",
    ]) {
      const verdict = local.verdict("bash", { command });
      expect(verdict.approval).toBeDefined();
      expect(verdict.remember).toBeUndefined();
    }
  });

  test("a networking command stays asked every time where network requests are not asked about", () => {
    const { askOutside: _ask, ...network } = codeAgentPresets.local(root).network;
    const quiet = new CodeAgentGate({ ...codeAgentPresets.local(root), network });
    expect(quiet.verdict("bash", { command: "curl https://example.com" })).toEqual({
      approval: "run: curl https://example.com",
    });
  });

  test("a line that cannot be split with confidence, or that writes a file by redirection, asks with no session answer", () => {
    const local = gate();
    allow(local, ["echo", "ls", "wc"]);
    for (const command of ["echo `ls`", "for f in a b; do wc -l $f; done", "echo hi > ~/.zshrc", "ls | wc -l > n.txt"])
      expect(local.verdict("bash", { command })).toEqual({ approval: `run: ${command}` });
  });

  test("forgetting what was allowed asks again", () => {
    const local = gate();
    allow(local, ["ls"]);
    expect(local.allowed.names).toEqual(["ls"]);
    expect(local.allowed.clear()).toBe(1);
    expect(local.verdict("bash", { command: "ls" }).remember).toEqual(["ls"]);
  });

  test("a file write that waits for approval has no session answer", () => {
    const web = new CodeAgentGate(codeAgentPresets.web(root));
    expect(web.verdict("write", { path: "a.ts" })).toEqual({ approval: "write a.ts" });
  });

  test("an approval still waiting is covered once the names it offered are all allowed", () => {
    const local = gate();
    local.allowed.offer("a1", ["bun test"]);
    local.allowed.offer("a2", ["bun test"]);
    local.allowed.offer("a3", ["bun test", "cd"]);
    expect(local.allowed.settle("a1", true)).toEqual(["bun test"]);
    expect(local.allowed.covered()).toEqual(["a2"]);
    expect(local.allowed.settle("a2", false)).toEqual([]);
    expect(local.allowed.covered()).toEqual([]);
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
    expect(mapper.map(finished("aborted"))).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "aborted" }]);
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
          autoCompactAt: undefined,
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

  test("leaves an ordinary command alone where commands are not asked about", () => {
    const gate = new CodeAgentGate(localUnasked());
    expect(gate.verdict("bash", { command: "bun test --isolate" })).toEqual({});
    expect(gate.verdict("bash", { command: "grep -r TODO ." })).toEqual({});
  });
});

describe("CodeAgentGate secrets", () => {
  const gate = () => new CodeAgentGate(localUnasked());

  test("a per-environment server env file is refused for read, write and shell, and its loader is not", () => {
    const file = "apps/a/env/env.server.main.ts";
    expect(gate().verdict("read", { path: file }).block).toContain("deny list");
    expect(gate().verdict("write", { path: file }).block).toContain("deny list");
    expect(gate().verdict("bash", { command: `cat ${file}` }).block).toBeDefined();
    expect(gate().verdict("read", { path: "apps/a/env/env.server.ts" })).toEqual({});
    expect(gate().verdict("read", { path: "apps/a/env/env.server.type.ts" })).toEqual({});
  });

  test("the engine's own spellings of a path are read as the path they name", () => {
    expect(gate().verdict("read", { path: "@.env" }).block).toContain("deny list");
    expect(gate().verdict("read", { path: `file://${root}/apps/a/.env` }).block).toContain("deny list");
    expect(gate().verdict("read", { path: "~/notes.md" }).block).toContain("outside the agent root");
  });

  test("a shell command naming the home credential stores or a wildcard for a secret file is refused", () => {
    expect(gate().verdict("bash", { command: "cat ~/.akan/code/auth.json" }).block).toBeDefined();
    expect(gate().verdict("bash", { command: "cat $HOME/.ssh/id_ed25519" }).block).toBeDefined();
    expect(gate().verdict("bash", { command: "cat .e?v" }).block).toBeDefined();
    expect(gate().verdict("bash", { command: "cat .akan/code/mcp.json" }).block).toBeDefined();
    expect(gate().verdict("bash", { command: "grep -r TODO --include=*.ts ." })).toEqual({});
  });

  test("a link inside the root is judged by the file it points at", () => {
    const linked = mkdtempSync(path.join(tmpdir(), "akan-gate-"));
    try {
      mkdirSync(path.join(linked, "secrets"));
      writeFileSync(path.join(linked, "secrets", "token.json"), "{}");
      symlinkSync(path.join(linked, "secrets", "token.json"), path.join(linked, "notes.json"));
      const linkedGate = new CodeAgentGate(codeAgentPresets.local(linked));
      expect(linkedGate.verdict("read", { path: "notes.json" }).block).toContain("deny list");
    } finally {
      rmSync(linked, { recursive: true, force: true });
    }
  });

  test("a link inside the root that leads out of it is read, and a denied file through it is not", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "akan-gate-"));
    const linkedLib = mkdtempSync(path.join(tmpdir(), "akan-gate-lib-"));
    try {
      writeFileSync(path.join(linkedLib, "index.ts"), "export {};");
      writeFileSync(path.join(linkedLib, ".env"), "");
      mkdirSync(path.join(repo, "node_modules"));
      symlinkSync(linkedLib, path.join(repo, "node_modules", "lib"));
      const linkedGate = new CodeAgentGate(codeAgentPresets.local(repo));
      expect(linkedGate.verdict("read", { path: "node_modules/lib/index.ts" })).toEqual({});
      expect(linkedGate.verdict("read", { path: "node_modules/lib/.env" }).block).toContain("deny list");
      expect(linkedGate.verdict("read", { path: path.join(linkedLib, "index.ts") }).block).toContain(
        "outside the agent root",
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(linkedLib, { recursive: true, force: true });
    }
  });
});

describe("CodeAgentGate network", () => {
  const gate = () => new CodeAgentGate(localUnasked());

  test("the local profile asks before fetching a host off its list, and not for a listed one or loopback", () => {
    expect(gate().verdict("web_fetch", { url: "https://example.com/x" })).toEqual({
      approval: "fetch https://example.com/x",
      strict: true,
    });
    expect(gate().verdict("web_fetch", { url: "https://docs.github.com/en" })).toEqual({});
    expect(gate().verdict("web_fetch", { url: "http://localhost:3000/" })).toEqual({});
  });

  test("a networking shell command asks, unless it only reaches loopback over http", () => {
    expect(gate().verdict("bash", { command: "curl -s https://example.com" }).strict).toBe(true);
    expect(gate().verdict("bash", { command: "curl -X POST https://github.com/x" }).strict).toBe(true);
    expect(gate().verdict("bash", { command: "ssh deploy@host" }).strict).toBe(true);
    expect(gate().verdict("bash", { command: "curl http://127.0.0.1:8080/health" })).toEqual({});
    expect(gate().verdict("bash", { command: "git status && bun test" })).toEqual({});
  });

  test("a loopback host:port without a scheme is loopback, and any other host still asks", () => {
    expect(gate().verdict("bash", { command: "curl -s localhost:4200/health" })).toEqual({});
    expect(gate().verdict("bash", { command: 'wget -qO- "127.0.0.1:8080"' })).toEqual({});
    expect(gate().verdict("bash", { command: "curl [::1]:3000/x" })).toEqual({});
    expect(gate().verdict("bash", { command: "curl -s example.com:443/x" }).strict).toBe(true);
    expect(gate().verdict("bash", { command: "curl -s localhost:4200 example.com:80" }).strict).toBe(true);
  });

  test("a client name asks only where it runs as a command, not as another command's argument", () => {
    for (const command of ["grep -rn curl src", "echo ssh", "git log --grep=wget", "cat docs/rsync.md"])
      expect(gate().verdict("bash", { command })).toEqual({});
    for (const command of [
      "ls && curl https://example.com",
      "cat body | curl -d @- https://example.com",
      "echo $(curl https://example.com)",
      "FOO=1 sudo -E /usr/bin/curl https://example.com",
      "timeout 5 wget https://example.com",
      "sh -c 'curl https://example.com'",
      "bun test\nssh deploy@host",
    ])
      expect(gate().verdict("bash", { command }).strict).toBe(true);
  });

  test("a profile without a list never asks", () => {
    const pod = new CodeAgentGate(codeAgentPresets.pod(root));
    expect(pod.verdict("web_fetch", { url: "https://example.com/x" })).toEqual({});
    expect(pod.verdict("bash", { command: "curl https://example.com" })).toEqual({});
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
  test("the engine's `length` is a partial success, not a completed turn", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    expect(mapper.map(finished("length"))).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "truncated" }]);
  });

  test("an abort still wins over the engine's report", () => {
    const mapper = new CodeAgentEventMapper();
    mapper.map(start);
    mapper.noteOutcome("aborted");
    expect(mapper.map(finished("length"))).toEqual([{ type: "turn_end", turnId: "t1", stopReason: "aborted" }]);
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
  test("every event type either has a producer in the core or is documented as host-supplied", async () => {
    const dir = import.meta.dir;
    const sources = await Promise.all(
      ["CodeAgent.ts", "CodeAgentEventMapper.ts"].map(async (file) => await Bun.file(`${dir}/${file}`).text()),
    );
    const core = sources.join("\n");
    const hostSupplied = new Set(["host"]);
    const missing = Object.keys(codeAgentEventPersistence).filter(
      (type) => !hostSupplied.has(type) && !core.includes(`type: "${type}"`),
    );
    expect(missing).toEqual([]);
  });
});
