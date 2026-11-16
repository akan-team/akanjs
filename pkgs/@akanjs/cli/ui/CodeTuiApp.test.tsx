import { afterEach, describe, expect, test } from "bun:test";
import { render } from "ink";
import type { CodeTuiLine } from "../code/CodeTuiLines";
import { type CodeTuiActions, CodeTuiApp, type CodeTuiSnapshot } from "./CodeTuiApp";
import { esc, FakeStdout, makeStdin, nextFrame } from "./fakeTerminal.spec";

const keys = {
  up: `${esc}[A`,
  down: `${esc}[B`,
  enter: "\r",
  escape: esc,
  ctrlC: String.fromCharCode(3),
  pageUp: `${esc}[5~`,
  backspace: String.fromCharCode(127),
};

const lineOf = (key: string, text: string): CodeTuiLine => ({ key, spans: [{ text }] });

interface Harness {
  stdout: FakeStdout;
  calls: string[];
  unmount: () => void;
  press: (input: string) => Promise<void>;
}

const harnesses: Harness[] = [];

const mount = (patch: Partial<CodeTuiSnapshot> = {}): Harness => {
  const stdout = new FakeStdout(90, 16);
  const stdin = makeStdin();
  const calls: string[] = [];
  const snapshot: CodeTuiSnapshot = {
    topRule: [
      { text: "─".repeat(80), dim: true },
      { text: " 01a0bcae ─", dim: true },
    ],
    bottomRule: [
      { text: "─".repeat(40), dim: true },
      { text: " DeepSeek V4 Flash · 4% of 1000k · local ─", dim: true },
    ],
    overlay: null,
    offered: false,
    subagents: [],
    lines: [lineOf("a", "› add a comment module"), lineOf("b", "✓ list_modules")],
    above: 0,
    below: 0,
    following: true,
    status: "",
    mode: "input",
    input: [""],
    cursor: { x: 2, y: 14 },
    menu: [],
    menuSelected: 0,
    placeholder: "ask for something, / for commands",
    prompt: "",
    options: [],
    selected: 0,
    checked: [],
    multiSelect: false,
    notice: "",
    hint: "enter send · ↑↓ history · esc interrupt",
    columns: 90,
    frameRows: 16,
    bodyHeight: 13,
    ...patch,
  };
  const actions: CodeTuiActions = {
    subscribe: () => () => undefined,
    snapshot: () => snapshot,
    type: (text) => calls.push(`type:${text}`),
    edit: (action) => calls.push(`edit:${action}`),
    submit: () => calls.push("submit"),
    newline: () => calls.push("newline"),
    paste: () => calls.push("paste"),
    pasted: (text) => calls.push(`pasted:${text}`),
    complete: () => calls.push("complete"),
    vertical: (delta) => calls.push(`vertical:${delta}`),
    scroll: (delta) => calls.push(`scroll:${delta}`),
    move: (delta) => calls.push(`move:${delta}`),
    toggle: () => calls.push("toggle"),
    answerConfirm: (value) => calls.push(`answerConfirm:${value}`),
    allowForSession: () => calls.push("allowForSession"),
    cancel: () => calls.push("cancel"),
    interrupt: () => calls.push("interrupt"),
  };
  const instance = render(<CodeTuiApp actions={actions} />, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  const harness: Harness = {
    stdout,
    calls,
    unmount: () => instance.unmount(),
    press: async (input: string) => {
      stdin.write(input);
      await nextFrame();
    },
  };
  harnesses.push(harness);
  return harness;
};

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.unmount();
});

describe("CodeTuiApp", () => {
  test("draws the session line, the transcript and the input row", async () => {
    const { stdout } = mount();
    await nextFrame();
    const frame = stdout.lastFrame;
    expect(frame).toContain("01a0bcae");
    expect(frame).toContain("4% of 1000k");
    expect(frame).toContain("add a comment module");
    expect(frame).toContain("ask for something, / for commands");
    expect(frame).toContain("enter send");
  });

  test("running sub-agents draw between the prompt and the model line", async () => {
    const { stdout } = mount({
      subagents: [
        lineOf("agents:self", "❯ ⏺ main"),
        lineOf("agents:c0", "  ◯ explore  Counting desc strings        12m 30s · ↓ 301.3k tokens"),
      ],
    });
    await nextFrame();
    const frame = stdout.lastFrame;
    expect(frame).toContain("◯ explore");
    expect(frame).toContain("↓ 301.3k tokens");
    expect(frame.indexOf("ask for something")).toBeLessThan(frame.indexOf("◯ explore"));
    expect(frame.indexOf("◯ explore")).toBeLessThan(frame.indexOf("4% of 1000k"));
  });

  test("an overlay covers the transcript and says how much of itself is off screen", async () => {
    const { stdout } = mount({
      overlay: { title: "help", lines: [lineOf("h", "/help · /tools")], above: 0, below: 7, selectable: false },
    });
    await nextFrame();
    expect(stdout.lastFrame).toContain("help");
    expect(stdout.lastFrame).toContain("▼7");
    expect(stdout.lastFrame).not.toContain("add a comment module");
  });

  test("typing goes to the input and enter sends it", async () => {
    const harness = mount();
    await harness.press("hi");
    await harness.press(keys.enter);
    expect(harness.calls).toEqual(["type:hi", "submit"]);
  });

  test("the arrows move within the prompt; the controller falls through to history at its edges", async () => {
    const harness = mount();
    await harness.press(keys.up);
    await harness.press(keys.down);
    expect(harness.calls).toEqual(["vertical:-1", "vertical:1"]);
  });

  test("page keys scroll in every mode, so a question never hides what led to it", async () => {
    const harness = mount({ mode: "select", options: [{ key: "a", label: "akan" }], bodyHeight: 13 });
    await harness.press(keys.pageUp);
    expect(harness.calls[0]).toStartWith("scroll:-");
  });

  test("a select question takes the arrows and enter instead", async () => {
    const harness = mount({
      mode: "select",
      prompt: "? Which app?",
      options: [
        { key: "akan", label: "akan" },
        { key: "minimal", label: "minimal" },
      ],
      selected: 1,
      bodyHeight: 12,
    });
    await nextFrame();
    expect(harness.stdout.lastFrame).toContain("? Which app?");
    await harness.press(keys.down);
    await harness.press(keys.enter);
    expect(harness.calls).toEqual(["move:1", "submit"]);
  });

  test("space toggles only when the question is multi-select", async () => {
    const single = mount({ mode: "select", options: [{ key: "a", label: "akan" }], bodyHeight: 13 });
    await single.press(" ");
    expect(single.calls).toEqual([]);
    const multi = mount({
      mode: "select",
      multiSelect: true,
      checked: ["a"],
      options: [{ key: "a", label: "akan" }],
      bodyHeight: 13,
    });
    await multi.press(" ");
    expect(multi.calls).toEqual(["toggle"]);
    expect(multi.stdout.lastFrame).toContain("[x] akan");
  });

  test("an approval is y or n, and escape is a no", async () => {
    const harness = mount({ mode: "confirm", prompt: "approve? write a.ts  [y/n]", bodyHeight: 14 });
    await nextFrame();
    expect(harness.stdout.lastFrame).toContain("approve? write a.ts");
    await harness.press("y");
    await harness.press("n");
    await harness.press(keys.escape);
    expect(harness.calls).toEqual(["answerConfirm:true", "answerConfirm:false", "cancel"]);
  });

  test("a at an approval is the answer for the rest of the session, and is not typed anywhere else", async () => {
    const confirm = mount({ mode: "confirm", prompt: "approve? run: bun test  [y/n/a]", bodyHeight: 14 });
    await confirm.press("a");
    await confirm.press("A");
    expect(confirm.calls).toEqual(["allowForSession", "allowForSession"]);
    const input = mount();
    await input.press("a");
    expect(input.calls).toEqual(["type:a"]);
  });

  test("a confirm question does not treat a stray letter as text", async () => {
    const harness = mount({ mode: "confirm", prompt: "? Continue?", bodyHeight: 14 });
    await harness.press("q");
    expect(harness.calls).toEqual([]);
  });

  test("ctrl-c is an interrupt, not a type", async () => {
    const harness = mount();
    await harness.press(keys.ctrlC);
    expect(harness.calls).toEqual(["interrupt"]);
  });

  test("backspace deletes rather than typing a control character", async () => {
    const harness = mount({ input: ["abc"] });
    await harness.press(keys.backspace);
    expect(harness.calls).toEqual(["edit:backspace"]);
  });

  test("a working turn changes the input marker so the state is visible while typing", async () => {
    const { stdout } = mount({ status: "working", placeholder: "type to steer, esc to interrupt" });
    await nextFrame();
    expect(stdout.lastFrame).toContain("◐");
    expect(stdout.lastFrame).toContain("type to steer");
  });

  test("a notice replaces the hints until it expires", async () => {
    const { stdout } = mount({ notice: "interrupted — ^c again to quit" });
    await nextFrame();
    expect(stdout.lastFrame).toContain("interrupted");
    expect(stdout.lastFrame).not.toContain("enter send");
  });
});
