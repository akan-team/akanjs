import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CodeAgent } from "@akanjs/devkit/codeAgent";
import { akanCodePaths } from "@akanjs/devkit/codeAgent/agent/akanCodePaths";
import { McpServerConfig } from "@akanjs/devkit/codeAgent/tools/McpServerConfig";
import type {
  CodeAgentAnswer,
  CodeAgentEvent,
  CodeAgentEventBody,
  CodeAgentMcpStatus,
  CodeAgentSessionInfo,
} from "akanjs/common";
import { csi, esc, FakeStdout, makeStdin } from "../ui/fakeTerminal.spec";
import { CodeTui, type CodeTuiExit } from "./CodeTui";
import { CodeTuiClipboard } from "./CodeTuiClipboard";
import { CodeTuiMouse } from "./CodeTuiMouse";

const info: CodeAgentSessionInfo = {
  sessionId: "s1",
  cwd: "/repo",
  profile: "local",
  model: { provider: "deepseek", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  tools: ["read", "bash"],
  contextTokens: 1_000_000,
  effort: "medium",
  autoCompactAt: undefined,
  name: undefined,
  interaction: { question: "await", approval: "await" },
};

class FakeAgent {
  readonly calls: string[] = [];
  readonly profile: CodeAgent["profile"];
  canSeeImages = true;
  stored: { id: string; name?: string; opening: string; updatedAt: number; turns: number }[] = [];
  mcp: CodeAgentMcpStatus[] = [];
  readonly workspaceRoot: string;
  #listener: ((event: CodeAgentEvent) => void) | undefined;
  #seq = 0;
  streaming = false;

  constructor(root: string) {
    this.profile = { paths: { root } } as CodeAgent["profile"];
    this.workspaceRoot = root;
  }

  sessions() {
    return this.stored;
  }

  mcpServers() {
    return this.mcp;
  }

  catalogue() {
    return [
      {
        id: "deepseek",
        name: "DeepSeek",
        authorized: true,
        models: [{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1_000_000, current: true }],
      },
      { id: "anthropic", name: "Anthropic", authorized: false, models: [{ id: "opus", name: "Opus", current: false }] },
    ];
  }

  setName(name: string) {
    this.calls.push(`setName:${name}`);
  }

  efforts() {
    return ["low", "medium", "high"];
  }

  setEffort(effort: string) {
    this.calls.push(`setEffort:${effort}`);
  }

  setAutoCompactAt(percent: number) {
    this.calls.push(`setAutoCompactAt:${percent}`);
    this.emit({ type: "session", info: { ...info, autoCompactAt: percent === 100 ? undefined : percent } });
  }

  on(listener: (event: CodeAgentEvent) => void) {
    this.#listener = listener;
    return () => {
      this.#listener = undefined;
    };
  }

  announce() {
    this.emit({ type: "session", info });
  }

  emit(body: CodeAgentEventBody) {
    this.#seq += 1;
    this.#listener?.({ ...body, seq: this.#seq } as CodeAgentEvent);
  }

  async prompt(message: string, images?: { path: string }[]) {
    const attached = (images ?? []).map((image) => `:${image.path}`).join("");
    this.calls.push(`prompt:${message}${attached}`);
  }

  async abort() {
    this.calls.push("abort");
  }

  async compact(instructions?: string) {
    this.calls.push(`compact:${instructions ?? ""}`);
  }

  async setModel(ref: { provider: string; id: string }) {
    this.calls.push(`setModel:${ref.provider}/${ref.id}`);
  }

  async answer(questionId: string, answer: CodeAgentAnswer) {
    this.calls.push(`answer:${questionId}:${JSON.stringify(answer)}`);
    return true;
  }

  async approve(approvalId: string, approved: boolean) {
    this.calls.push(`approve:${approvalId}:${approved}`);
    return true;
  }
}

const keys = { backspace: String.fromCharCode(127) };

// Ink moves the cursor "up N from the line after the last one", so the row is read from the frame of the same write.
const caretOf = (stdout: FakeStdout) => {
  const suffix = new RegExp(`(?:${esc}\\[(\\d+)A)?${esc}\\[(\\d+)G${esc}\\[\\?25h`);
  for (let at = stdout.frames.length - 1; at >= 0; at -= 1) {
    const frame = stdout.frames[at] ?? "";
    const match = suffix.exec(frame);
    const text = frame.replace(csi, "");
    if (!match || !text.trim()) continue;
    const lines = text.split("\n");
    return {
      row: (text.endsWith("\n") ? lines.length - 1 : lines.length) - Number(match[1] ?? 0),
      column: Number(match[2] ?? 1) - 1,
      lines,
    };
  }
  return undefined;
};

// Ink throttles frame writes to `maxFps: 30`, and the host adds its own 34ms frame timer on top.
const settle = () => Bun.sleep(140);

// `/mcp add` writes the home config, so without this the suite would declare its fixtures in the runner's ~/.akan.
beforeAll(() => {
  const home = mkdtempSync(path.join(tmpdir(), "akan-tui-home-"));
  process.env.AKAN_CODE_HOME = home;
  expect(akanCodePaths.globalMcpFile().startsWith(home)).toBe(true);
});

const running: { tui: CodeTui; done: Promise<CodeTuiExit | undefined> }[] = [];

const mount = (root = "/repo") => {
  // Only a tty reaches Ink's fullscreen branch, which the caret assertions below must be able to tell apart.
  const stdout = new FakeStdout(90, 20, true);
  const stdin = makeStdin();
  const agent = new FakeAgent(root);
  const tui = new CodeTui(agent as unknown as CodeAgent, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
  });
  const done = tui.run();
  running.push({ tui, done });
  return {
    agent,
    stdout,
    done,
    tui,
    press: async (input: string) => {
      stdin.write(input);
      await settle();
    },
    emit: async (body: CodeAgentEventBody) => {
      agent.emit(body);
      await settle();
    },
  };
};

afterEach(async () => {
  for (const entry of running.splice(0)) {
    entry.tui.close();
    await entry.done;
  }
});

describe("CodeTui", () => {
  test("announces the session and draws its line", async () => {
    const { stdout } = mount();
    await settle();
    expect(stdout.lastFrame).toContain("DeepSeek V4 Flash");
    expect(stdout.lastFrame).toContain("1000k ctx");
  });

  test("a typed prompt is echoed locally and sent once", async () => {
    const harness = mount();
    await settle();
    await harness.press("hi there");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["prompt:hi there"]);
    expect(harness.stdout.lastFrame).toContain("› hi there");
    await harness.emit({ type: "message", turnId: "t1", role: "user", text: "hi there" });
    expect(harness.stdout.lastFrame.split("› hi there").length - 1).toBe(1);
  });

  test("a streamed answer appears as it arrives and keeps one bubble", async () => {
    const harness = mount();
    await settle();
    await harness.emit({ type: "turn_start", turnId: "t1" });
    await harness.emit({ type: "text_delta", turnId: "t1", text: "the answer" });
    expect(harness.stdout.lastFrame).toContain("the answer");
    expect(harness.stdout.lastFrame).toContain("◐");
    await harness.emit({ type: "message", turnId: "t1", role: "assistant", text: "the whole answer" });
    await harness.emit({ type: "turn_end", turnId: "t1", stopReason: "done" });
    expect(harness.stdout.lastFrame).toContain("the whole answer");
    expect(harness.stdout.lastFrame).not.toContain("◐");
  });

  test("a running sub-agent draws a rail under the prompt and leaves with the turn", async () => {
    const harness = mount();
    await settle();
    const rows = harness.stdout.lastFrame.split("\n").length;
    await harness.emit({
      type: "subagent",
      agents: [
        { id: "c0", kind: "explore", description: "Counting desc strings", startedAt: Date.now(), tokens: 12_400 },
      ],
    });
    expect(harness.stdout.lastFrame).toContain("◯ explore  Counting desc strings");
    expect(harness.stdout.lastFrame).toContain("↓ 12.4k tokens");
    expect(harness.stdout.lastFrame.split("\n").length).toBe(rows);
    await harness.emit({ type: "idle" });
    expect(harness.stdout.lastFrame).not.toContain("◯ explore");
  });

  test("the wheel scrolls the transcript, and the terminal is asked for it and released again", async () => {
    const harness = mount();
    await settle();
    expect(harness.stdout.frames.join("")).toContain(CodeTuiMouse.on);
    for (let at = 0; at < 40; at += 1)
      harness.agent.emit({ type: "message", turnId: `t${at}`, role: "assistant", text: `line ${at}` });
    await settle();
    expect(harness.stdout.lastFrame).not.toContain("paused");
    await harness.press("\u001b[<64;10;5M");
    expect(harness.stdout.lastFrame).toContain("paused");
    expect(harness.stdout.lastFrame).not.toContain("64;10;5");
    await harness.press("\u001b[<65;10;5M");
    await harness.press("\u001b[<65;10;5M");
    expect(harness.stdout.lastFrame).not.toContain("paused");
    harness.tui.close();
    expect(harness.stdout.frames.join("")).toContain(CodeTuiMouse.off);
  });

  test("/mcp lists the servers this session reached, and says where they are declared", async () => {
    const harness = mount();
    harness.agent.mcp = [
      { name: "github", transport: "stdio", target: "npx -y server-github", tools: ["mcp__github__search"] },
    ];
    await settle();
    await harness.press("/mcp");
    await harness.press("\r");
    expect(harness.stdout.lastFrame).toContain("github");
    expect(harness.stdout.lastFrame).toContain("1 tool");
  });

  test("/mcp add writes the home file and reopens this session to pick it up", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "akan-tui-mcp-"));
    const harness = mount(root);
    harness.agent.stored = [{ id: "s1", opening: "hi", updatedAt: Date.now(), turns: 1 }];
    await settle();
    await harness.press("/mcp add github npx -y server-github");
    await harness.press("\r");
    expect(await harness.done).toEqual({ id: "s1", notice: "added github · npx -y server-github · every repo" });
    const file = JSON.parse(readFileSync(akanCodePaths.globalMcpFile(), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(file.mcpServers.github).toEqual({ command: "npx", args: ["-y", "server-github"] });
    rmSync(akanCodePaths.globalMcpFile(), { force: true });
    rmSync(root, { recursive: true, force: true });
  });

  test("/mcp add --local writes the workspace file instead", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "akan-tui-mcp-"));
    const harness = mount(root);
    harness.agent.stored = [{ id: "s1", opening: "hi", updatedAt: Date.now(), turns: 1 }];
    await settle();
    await harness.press("/mcp add --local repobot bun run bot.ts");
    await harness.press("\r");
    expect(await harness.done).toEqual({ id: "s1", notice: "added repobot · bun run bot.ts · this repo" });
    const file = JSON.parse(readFileSync(path.join(root, ".akan", "code", "mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(file.mcpServers.repobot).toEqual({ command: "bun", args: ["run", "bot.ts"] });
    expect(existsSync(akanCodePaths.globalMcpFile())).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  test("/mcp remove says when the home file still declares the name it took from this repo", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "akan-tui-mcp-"));
    McpServerConfig.add(root, "shared", ["home"], "global");
    McpServerConfig.add(root, "shared", ["repo"], "workspace");
    const harness = mount(root);
    harness.agent.stored = [{ id: "s1", opening: "hi", updatedAt: Date.now(), turns: 1 }];
    await settle();
    await harness.press("/mcp remove shared");
    await harness.press("\r");
    const exit = await harness.done;
    expect(exit?.notice).toStartWith("removed shared from the workspace file");
    expect(exit?.notice).toContain("the global file still declares it, so it still applies");
    expect(McpServerConfig.declared(root).map((entry) => entry.scope)).toEqual(["global"]);
    rmSync(akanCodePaths.globalMcpFile(), { force: true });
    rmSync(root, { recursive: true, force: true });
  });

  test("/mcp remove --local leaves a name only the home file declares where it is", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "akan-tui-mcp-"));
    McpServerConfig.add(root, "office", ["https://office.example/mcp"], "global");
    const harness = mount(root);
    harness.agent.stored = [{ id: "s1", opening: "hi", updatedAt: Date.now(), turns: 1 }];
    await settle();
    await harness.press("/mcp remove --local office");
    await harness.press("\r");
    expect(harness.stdout.lastFrame).toContain(`"office" is not declared in this repo's file`);
    expect(McpServerConfig.declared(root).map((entry) => entry.scope)).toEqual(["global"]);
    rmSync(akanCodePaths.globalMcpFile(), { force: true });
    rmSync(root, { recursive: true, force: true });
  });

  test("a session with nothing on disk is told a reload has nothing to reopen", async () => {
    const harness = mount();
    await settle();
    await harness.press("/mcp reload");
    await harness.press("\r");
    expect(harness.stdout.lastFrame).toContain("not on disk yet");
  });

  const question = {
    questionId: "q1",
    prompt: "Which database?",
    kind: "select" as const,
    options: [
      { key: "0", label: "Postgres" },
      { key: "1", label: "SQLite", recommended: true },
    ],
    freeText: true,
  };

  test("a recommended option is labelled and waiting under the cursor", async () => {
    const harness = mount();
    await settle();
    await harness.emit({ type: "question", question });
    expect(harness.stdout.lastFrame).toContain("SQLite (recommended)");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(['answer:q1:{"keys":["1"]}']);
  });

  test("a question offering free text grows a choice that opens the prompt", async () => {
    const harness = mount();
    await settle();
    await harness.emit({ type: "question", question });
    expect(harness.stdout.lastFrame).toContain("Something else…");
    await harness.press("\u001b[B");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual([]);
    expect(harness.stdout.lastFrame).toContain("esc back to the choices");
    await harness.press("mysql, actually");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(['answer:q1:{"text":"mysql, actually"}']);
  });

  test("escape out of typing goes back to the choices rather than skipping the question", async () => {
    const harness = mount();
    await settle();
    await harness.emit({ type: "question", question });
    await harness.press("\u001b[B");
    await harness.press("\r");
    await harness.press("\u001b");
    expect(harness.agent.calls).toEqual([]);
    expect(harness.stdout.lastFrame).toContain("SQLite (recommended)");
    await harness.press("\u001b[A");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(['answer:q1:{"keys":["1"]}']);
  });

  test("a question with no options is answered in prose", async () => {
    const harness = mount();
    await settle();
    await harness.emit({
      type: "question",
      question: { questionId: "q2", prompt: "Why is it slow?", kind: "text", freeText: true },
    });
    await harness.press("the index is missing");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(['answer:q2:{"text":"the index is missing"}']);
  });

  test("escape interrupts a running turn instead of clearing the line", async () => {
    const harness = mount();
    await settle();
    await harness.emit({ type: "turn_start", turnId: "t1" });
    await harness.press(esc);
    expect(harness.agent.calls).toEqual(["abort"]);
  });

  test("a select question is answered by key, not by the label a host happened to draw", async () => {
    const harness = mount();
    await settle();
    await harness.emit({
      type: "question",
      question: {
        questionId: "q1",
        prompt: "Which app?",
        kind: "select",
        options: [
          { key: "akan", label: "akan" },
          { key: "minimal", label: "minimal" },
        ],
      },
    });
    expect(harness.stdout.lastFrame).toContain("Which app?");
    await harness.press(`${esc}[B`);
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(['answer:q1:{"keys":["minimal"]}']);
  });

  test("a multi-select keeps every ticked key, which is what a reconnecting client restores from", async () => {
    const harness = mount();
    await settle();
    await harness.emit({
      type: "question",
      question: {
        questionId: "q1",
        prompt: "Which apps?",
        kind: "select",
        multiSelect: true,
        options: [
          { key: "akan", label: "akan" },
          { key: "minimal", label: "minimal" },
        ],
      },
    });
    await harness.press(" ");
    await harness.press(`${esc}[B`);
    await harness.press(" ");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(['answer:q1:{"keys":["akan","minimal"]}']);
  });

  test("an approval takes y or n and nothing else", async () => {
    const harness = mount();
    await settle();
    await harness.emit({
      type: "approval",
      request: { approvalId: "a1", toolCallId: "c0", name: "write", summary: "write a.ts", policy: "writes" },
    });
    expect(harness.stdout.lastFrame).toContain("approve? write a.ts");
    await harness.press("q");
    expect(harness.agent.calls).toEqual([]);
    await harness.press("n");
    expect(harness.agent.calls).toEqual(["approve:a1:false"]);
  });

  test("slash commands reach the core rather than the model", async () => {
    const harness = mount();
    await settle();
    await harness.press("/compact keep the plan");
    await harness.press("\r");
    await harness.press("/model deepseek/deepseek-v4-pro");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["compact:keep the plan", "setModel:deepseek/deepseek-v4-pro"]);
  });

  test("an unknown slash command answers in an overlay and leaves the transcript alone", async () => {
    const harness = mount();
    await settle();
    await harness.press("hello there");
    await harness.press("\r");
    await harness.press("/nope");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["prompt:hello there"]);
    expect(harness.stdout.lastFrame).toContain("There is no /nope");
    expect(harness.stdout.lastFrame).not.toContain("› hello there");
    await harness.press(esc);
    expect(harness.stdout.lastFrame).toContain("› hello there");
    expect(harness.stdout.lastFrame).not.toContain("There is no /nope");
  });

  test("the arrows replay what was already sent", async () => {
    const harness = mount();
    await settle();
    await harness.press("first");
    await harness.press("\r");
    await harness.press(`${esc}[A`);
    expect(harness.stdout.lastFrame).toContain("› first");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["prompt:first", "prompt:first"]);
  });

  test("a tool call is one row from start to end", async () => {
    const harness = mount();
    await settle();
    const tool = { toolCallId: "c0", name: "read", op: "read" as const, title: "read(a.ts)" };
    await harness.emit({ type: "tool_start", turnId: "t1", tool });
    await harness.emit({ type: "tool_end", turnId: "t1", tool, outcome: "ok", output: "", truncated: false });
    const frame = harness.stdout.lastFrame;
    expect(frame.split("read(a.ts)").length - 1).toBe(1);
    expect(frame).toContain("⏺ read(a.ts)");
  });

  test("a pasted block keeps its newlines instead of sending a fragment", async () => {
    const harness = mount();
    await settle();
    await harness.press("fix this:\r  at foo (a.ts:1)\r  at bar (b.ts:2)");
    expect(harness.agent.calls).toEqual([]);
    expect(harness.stdout.lastFrame).toContain("fix this:");
    expect(harness.stdout.lastFrame).toContain("at foo (a.ts:1)");
    expect(harness.stdout.lastFrame).toContain("at bar (b.ts:2)");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["prompt:fix this:\n  at foo (a.ts:1)\n  at bar (b.ts:2)"]);
  });

  test("typing a slash opens a menu of commands above the input", async () => {
    const harness = mount();
    await settle();
    await harness.press("/");
    expect(harness.stdout.lastFrame).toContain("/compact");
    expect(harness.stdout.lastFrame).toContain("/model");
    await harness.press("mo");
    const frame = harness.stdout.lastFrame;
    expect(frame).toContain("/model");
    expect(frame).not.toContain("/compact");
  });

  test("tab completes the highlighted command, with the space its argument needs", async () => {
    const harness = mount();
    await settle();
    await harness.press("/mo");
    await harness.press("\t");
    const frame = harness.stdout.lastFrame;
    expect(frame).toContain("› /model");
    expect(frame).not.toContain("switch model");
    expect(harness.agent.calls).toEqual([]);
  });

  test("the arrows walk the menu while it is open, not the history", async () => {
    const harness = mount();
    await settle();
    await harness.press("/");
    await harness.press(`${esc}[B`);
    await harness.press("\t");
    expect(harness.stdout.lastFrame).toContain("› /tools");
  });

  test("a line feed opens a second line and enter still sends the whole buffer", async () => {
    const harness = mount();
    await settle();
    await harness.press("first");
    await harness.press(String.fromCharCode(10));
    await harness.press("second");
    const frame = harness.stdout.lastFrame;
    expect(frame).toContain("› first");
    expect(frame).toContain("second");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["prompt:first\nsecond"]);
  });

  test("a shift+enter binding breaks the line without leaving its backslash behind", async () => {
    for (const ending of [String.fromCharCode(13), String.fromCharCode(10), `${esc}${String.fromCharCode(13)}`]) {
      const harness = mount();
      await settle();
      await harness.press("first");
      await harness.press(`\\${ending}`);
      await harness.press("second");
      expect(harness.stdout.lastFrame).not.toContain("\\");
      await harness.press("\r");
      expect(harness.agent.calls).toEqual(["prompt:first\nsecond"]);
    }
  });

  test("a backslash the user typed survives the line break after it", async () => {
    const harness = mount();
    await settle();
    await harness.press("a\\");
    await harness.press(`\\${String.fromCharCode(13)}`);
    await harness.press("b");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["prompt:a\\\nb"]);
  });

  test("the arrows move inside a multi-line prompt before they reach history", async () => {
    const harness = mount();
    await settle();
    await harness.press("sent");
    await harness.press("\r");
    await harness.press("one");
    await harness.press(String.fromCharCode(10));
    await harness.press("two");
    await harness.press(`${esc}[A`);
    expect(harness.stdout.lastFrame).toContain("one");
    await harness.press(`${esc}[A`);
    expect(harness.stdout.lastFrame).toContain("› sent");
  });

  test("the terminal cursor lands on the prompt row, after what has been typed", async () => {
    const harness = mount();
    await settle();
    await harness.press("hello");
    const caret = caretOf(harness.stdout);
    expect(caret).toBeDefined();
    expect(caret?.lines[caret.row]).toContain("› hello");
    expect(caret?.column).toBe("› hello".length);
  });

  test("the prompt sits between two rules", async () => {
    const harness = mount();
    await settle();
    expect(harness.stdout.lastFrame.split("─").length - 1).toBeGreaterThan(2);
    expect(harness.stdout.lastFrame).not.toContain("│");
  });

  test("enter runs the highlighted command, whether or not it was typed out in full", async () => {
    const harness = mount();
    await settle();
    await harness.press("/help");
    await harness.press("\r");
    expect(harness.stdout.lastFrame).toContain("list these commands and the keys");
    expect(harness.agent.calls).toEqual([]);
    await harness.press(esc);
    await harness.press("/ab");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["abort"]);
  });

  test("reasoning is folded to one line until it is asked for", async () => {
    const harness = mount();
    await settle();
    await harness.emit({ type: "turn_start", turnId: "t1" });
    await harness.emit({ type: "thinking_delta", turnId: "t1", text: "the user said hi\nkeep it short" });
    expect(harness.stdout.lastFrame).toContain("thinking · 2 lines");
    expect(harness.stdout.lastFrame).not.toContain("keep it short");
    await harness.press("/thinking");
    await harness.press("\r");
    expect(harness.stdout.lastFrame).toContain("keep it short");
  });

  test("ZZ down walks history back", async () => {
    const harness = mount();
    await settle();
    await harness.press("one");
    await harness.press("\r");
    await harness.press("two");
    await harness.press("\r");
    const promptRow = () => {
      const caret = caretOf(harness.stdout);
      return caret?.lines[caret.row];
    };
    await harness.press(`${esc}[A`);
    expect(promptRow()).toBe("› two");
    await harness.press(`${esc}[A`);
    expect(promptRow()).toBe("› one");
    await harness.press(`${esc}[B`);
    expect(promptRow()).toBe("› two");
    await harness.press(`${esc}[B`);
    expect(promptRow()).toContain("ask for something");
  });

  test("model, window, profile and effort ride the prompt's lower rule", async () => {
    const harness = mount();
    await settle();
    await harness.emit({ type: "context", used: 250_000, max: 1_000_000 });
    expect(harness.stdout.lastFrame).toContain("DeepSeek V4 Flash · 25% of 1000k · local · medium");
    expect(harness.stdout.lastFrame).toContain("s1 ─");
  });

  test("/effort lists what the model offers when it is given nothing it knows", async () => {
    const harness = mount();
    await settle();
    await harness.press("/effort");
    await harness.press("\r");
    expect(harness.stdout.lastFrame).toContain("low · medium · high");
    expect(harness.agent.calls).toEqual([]);
    await harness.press(esc);
    await harness.press("/effort high");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["setEffort:high"]);
  });

  test("/autocompact says where compaction starts, and the lower rule keeps a chosen share in view", async () => {
    const harness = mount();
    await settle();
    await harness.press("/autocompact 55");
    await harness.press("\r");
    expect(harness.stdout.lastFrame).toContain("now: autocompact default · compacts above 967k of 1000k");
    expect(harness.agent.calls).toEqual([]);
    await harness.press(esc);
    await harness.press("/autocompact 60%");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["setAutoCompactAt:60"]);
    expect(harness.stdout.lastFrame).toContain("autocompact 60% · compacts above 600k of 1000k");
    await harness.emit({ type: "context", used: 250_000, max: 1_000_000 });
    expect(harness.stdout.lastFrame).toContain("DeepSeek V4 Flash · 25% of 1000k · compacts at 60% · local · medium");
  });

  test("a session takes a name from what it was first asked, and /name replaces it", async () => {
    const harness = mount();
    await settle();
    await harness.press("/name refactor the store layer");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["setName:refactor the store layer"]);
    await harness.emit({ type: "session", info: { ...info, name: "refactor-the-store-layer" } });
    expect(harness.stdout.lastFrame).toContain("refactor-the-store-layer");
  });

  test("left at the start lists stored sessions, and enter leaves for the one chosen", async () => {
    const harness = mount();
    harness.agent.stored = [
      { id: "s1", name: "current-one", opening: "fix the gateway", updatedAt: Date.now(), turns: 2 },
      { id: "s2", name: "older-one", opening: "add a comment module", updatedAt: Date.now() - 7_200_000, turns: 9 },
    ];
    await settle();
    await harness.press(`${esc}[D`);
    expect(harness.stdout.lastFrame).toContain("older-one");
    expect(harness.stdout.lastFrame).toContain("add a comment module");
    expect(harness.stdout.lastFrame).toContain("2h ago");
    await harness.press(`${esc}[B`);
    await harness.press("\r");
    expect((await harness.done)?.id).toBe("s2");
  });

  test("ctrl+v says so rather than attaching when the model cannot read images", async () => {
    const harness = mount();
    harness.agent.canSeeImages = false;
    await settle();
    await harness.press(String.fromCharCode(22));
    const frame = harness.stdout.lastFrame;
    expect(frame).toContain("declares deepseek/deepseek-v4-flash text-only");
    expect(frame).toContain("modelOverrides");
  });

  test("an empty bracketed paste attaches the picture the clipboard was holding", async () => {
    const harness = mount();
    await settle();
    const file = path.join(tmpdir(), "clipboard.png");
    await Bun.write(file, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    const had = { has: CodeTuiClipboard.has, image: CodeTuiClipboard.image };
    CodeTuiClipboard.has = () => true;
    CodeTuiClipboard.image = () => Promise.resolve(file);
    try {
      await harness.press(`${esc}[200~${esc}[201~`);
      await settle();
      expect(harness.stdout.lastFrame).toContain("[image #1]");
    } finally {
      Object.assign(CodeTuiClipboard, had);
    }
  });

  test("an empty bracketed paste with an empty clipboard does nothing at all", async () => {
    const harness = mount();
    await settle();
    const had = CodeTuiClipboard.has;
    CodeTuiClipboard.has = () => false;
    try {
      await harness.press(`${esc}[200~${esc}[201~`);
      await settle();
      expect(harness.stdout.lastFrame).toContain("ask for something");
      expect(harness.stdout.lastFrame).not.toContain("[image");
    } finally {
      CodeTuiClipboard.has = had;
    }
  });

  test("a bracketed paste keeps its newlines instead of sending the prompt", async () => {
    const harness = mount();
    await settle();
    await harness.press(`${esc}[200~fix this:\rat foo (a.ts:1)\r${esc}[201~`);
    expect(harness.agent.calls).toEqual([]);
    expect(harness.stdout.lastFrame).toContain("at foo (a.ts:1)");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["prompt:fix this:\nat foo (a.ts:1)"]);
  });

  test("a bracketed paste ending in a newline runs nothing", async () => {
    const harness = mount();
    await settle();
    await harness.press(`${esc}[200~/help\r${esc}[201~`);
    const frame = harness.stdout.lastFrame;
    expect(frame).toContain("/help");
    expect(frame).not.toContain("list these commands");
    expect(frame).not.toContain("200~");
  });

  test("a pasted image path becomes a marker in the prompt, and the marker is the attachment", async () => {
    const harness = mount();
    await settle();
    const file = path.join(tmpdir(), "Screenshot at 20.11.02.png");
    await Bun.write(file, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    // Escaped spaces, the way a terminal writes a dragged or pasted path.
    await harness.press(file.replace(/ /g, "\\ "));
    expect(harness.stdout.lastFrame).toContain("[image #1]");
    expect(harness.stdout.lastFrame).not.toContain("Screenshot at");
    await harness.press("look at this");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual([`prompt:look at this:${file}`]);
    expect(harness.stdout.lastFrame).toContain("⧉ 1 image");
    await harness.emit({ type: "message", turnId: "t1", role: "user", text: "look at this" });
    expect(harness.stdout.lastFrame.split("› look at this").length - 1).toBe(1);
  });

  test("deleting the marker before sending un-attaches the image", async () => {
    const harness = mount();
    await settle();
    const file = path.join(tmpdir(), "akan-paste.png");
    await Bun.write(file, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    await harness.press(file);
    await harness.press("never mind");
    for (let at = 0; at < "never mind".length + "[image #1] ".length; at += 1) await harness.press(keys.backspace);
    await harness.press("just text");
    await harness.press("\r");
    expect(harness.agent.calls).toEqual(["prompt:just text"]);
  });

  test("an @ token completes a file in the repo", async () => {
    //? A repo of its own: CI unpacks the workspace from a tarball without `.git`, so the checkout lists nothing.
    const root = mkdtempSync(path.join(tmpdir(), "akan-tui-files-"));
    mkdirSync(path.join(root, "pkgs/cli/code"), { recursive: true });
    writeFileSync(path.join(root, "pkgs/cli/code/CodeTuiFiles.ts"), "");
    Bun.spawnSync(["git", "init", "--quiet"], { cwd: root });
    const harness = mount(root);
    await settle();
    await harness.press("read @codeTuiFiles");
    await settle();
    const frame = harness.stdout.lastFrame;
    expect(frame).toContain("@pkgs/cli/code/CodeTuiFiles.ts");
    await harness.press("\t");
    expect(harness.stdout.lastFrame).toContain("› read @pkgs/cli/code/CodeTuiFiles.ts");
    rmSync(root, { recursive: true, force: true });
  });

  test("the banner names the session at the top and survives what clears the conversation", async () => {
    const harness = mount();
    await settle();
    expect(harness.stdout.lastFrame).toContain("Akan — write one line, deploy every stack");
    await harness.press("remember this");
    await harness.press("\r");
    expect(harness.stdout.lastFrame).toContain("› remember this");
    await harness.press("/clear");
    await harness.press("\r");
    expect(harness.stdout.lastFrame).not.toContain("› remember this");
    expect(harness.stdout.lastFrame).toContain("Akan — write one line, deploy every stack");
    expect(harness.stdout.lastFrame).toContain("the model still remembers");
  });

  test("down walks back through history, whatever the recalled entry's height", async () => {
    const harness = mount();
    await settle();
    await harness.press(`one ${"long ".repeat(30)}`);
    await harness.press("\r");
    await harness.press("two");
    await harness.press("\r");
    // The transcript echoes each entry as ` › …`, so only the rows from the prompt's `› ` down to the caret are read.
    const prompt = () => {
      const caret = caretOf(harness.stdout);
      let top = caret?.row ?? 0;
      while (top > 0 && !caret?.lines[top]?.startsWith("› ")) top -= 1;
      return caret ? caret.lines.slice(top, caret.row + 1) : [];
    };
    await harness.press(`${esc}[A`);
    await harness.press(`${esc}[A`);
    expect(prompt()[0]).toStartWith("› one long");
    expect(prompt().length).toBeGreaterThan(1);
    await harness.press(`${esc}[B`);
    expect(prompt()).toEqual(["› two"]);
    await harness.press(`${esc}[B`);
    expect(prompt().join("\n")).toContain("ask for something");
  });
});
