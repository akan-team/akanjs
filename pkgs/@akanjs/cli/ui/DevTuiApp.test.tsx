import { afterEach, describe, expect, test } from "bun:test";
import { esc, FakeStdout, makeStdin, nextFrame } from "@akanjs/devkit/test/fakeTerminal";
import { render } from "ink";
import type { DevLogLine } from "../application/devLogBuffer";
import { HOST_SOURCE } from "../application/devLogBuffer";
import { type DevTuiActions, DevTuiApp, type DevTuiRailRow, type DevTuiSnapshot } from "./DevTuiApp";

class DevStdout extends FakeStdout {
  override get lastFrame() {
    return (this.frames.at(-1) ?? "").replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
  }
}

const lineOf = (seq: number, app: string, text: string, source = HOST_SOURCE): DevLogLine => ({
  seq,
  app,
  source,
  kind: "stdout",
  text,
});

const railOf = (): DevTuiRailRow[] => [
  { app: null, source: null, label: "all apps", state: null, port: null, depth: 0, appIndex: null },
  { app: "akan", source: null, label: "akan", state: "ready", port: 8282, depth: 0, appIndex: 1 },
  { app: "akan", source: HOST_SOURCE, label: HOST_SOURCE, state: null, port: null, depth: 1, appIndex: null },
  { app: "akan", source: "#0 all", label: "#0 all", state: null, port: null, depth: 1, appIndex: null },
  { app: "minimal", source: null, label: "minimal", state: "starting", port: 8283, depth: 0, appIndex: 2 },
];

interface Harness {
  stdout: DevStdout;
  calls: string[];
  unmount: () => void;
  press: (input: string) => Promise<void>;
  setSnapshot: (patch: Partial<DevTuiSnapshot>) => void;
}

const harnesses: Harness[] = [];

const mount = (patch: Partial<DevTuiSnapshot> = {}): Harness => {
  const stdout = new DevStdout(100, 14);
  const stdin = makeStdin();
  const calls: string[] = [];
  let snapshot: DevTuiSnapshot = {
    rows: railOf(),
    selected: 1,
    title: "akan · http://localhost:8282 · ready",
    lines: [lineOf(1, "akan", "gateway is running"), lineOf(2, "akan", "served", "#0 all")],
    above: 0,
    below: 0,
    following: true,
    prefix: "app",
    prefixWidth: 7,
    grep: "",
    errorsOnly: false,
    editingGrep: false,
    notice: "",
    hasShare: false,
    readyCount: 1,
    appCount: 2,
    logRows: 10,
    bodyHeight: 13,
    railWidth: 22,
    columns: 100,
    terminalRows: 14,
    ...patch,
  };
  const listeners = new Set<() => void>();
  const actions: DevTuiActions = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => snapshot,
    moveSelection: (delta) => calls.push(`moveSelection:${delta}`),
    selectApp: (index) => calls.push(`selectApp:${index}`),
    scroll: (delta) => calls.push(`scroll:${delta}`),
    follow: () => calls.push("follow"),
    setGrep: (grep) => calls.push(`setGrep:${grep}`),
    setEditingGrep: (editing) => calls.push(`setEditingGrep:${editing}`),
    toggleErrorsOnly: () => calls.push("toggleErrorsOnly"),
    clear: () => calls.push("clear"),
    copyLines: () => calls.push("copyLines"),
    copyPath: () => calls.push("copyPath"),
    copyShareUrl: () => calls.push("copyShareUrl"),
    openSelected: () => calls.push("openSelected"),
    restartSelected: () => calls.push("restartSelected"),
    quit: () => calls.push("quit"),
  };
  const instance = render(<DevTuiApp actions={actions} />, {
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
    setSnapshot: (next) => {
      snapshot = { ...snapshot, ...next };
      for (const listener of listeners) listener();
    },
  };
  harnesses.push(harness);
  return harness;
};

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.unmount();
});

describe("DevTuiApp", () => {
  test("draws the rail as apps with the selected app's processes under it", async () => {
    const { stdout } = mount();
    await nextFrame();
    const frame = stdout.lastFrame;
    expect(frame).toContain("apps 1/2");
    expect(frame).toContain("all apps");
    expect(frame).toContain("8282");
    expect(frame).toContain("8283");
    expect(frame).toContain(HOST_SOURCE);
    expect(frame).toContain("#0 all");
    expect(frame).toMatch(/● 1 akan 8282/);
    expect(frame).toMatch(/◐ 2 minimal 8283/);
    expect(frame).not.toMatch(/\d #0 all/);
  });

  test("a digit jumps to the nth app, not the nth rail row", async () => {
    const harness = mount();
    await nextFrame();
    await harness.press("2");
    await harness.press("1");
    expect(harness.calls).toEqual(["selectApp:1", "selectApp:0"]);
  });

  test("fills the terminal height from the first frame, before any log arrives", async () => {
    const empty = mount({ lines: [] });
    await nextFrame();
    const emptyHeight = empty.stdout.lastFrame.replace(/\n$/, "").split("\n").length;

    const full = mount({ lines: Array.from({ length: 40 }, (_, idx) => lineOf(idx + 1, "akan", `line-${idx + 1}`)) });
    await nextFrame();
    const fullHeight = full.stdout.lastFrame.replace(/\n$/, "").split("\n").length;

    expect(emptyHeight).toBe(14);
    expect(fullHeight).toBe(emptyHeight);
  });

  test("says so while paused, and names what is hidden either side", async () => {
    const following = mount();
    await nextFrame();
    expect(following.stdout.lastFrame).not.toContain("paused");

    const paused = mount({ following: false, above: 12, below: 7 });
    await nextFrame();
    expect(paused.stdout.lastFrame).toContain("▲12 ▼7 paused");
    expect(paused.stdout.lastFrame).toContain("G follow (paused)");
  });

  test("the line prefix follows the scope: app when merged, source inside an app, none inside one", async () => {
    const merged = mount({
      prefix: "app",
      lines: [lineOf(1, "akan", "one"), lineOf(2, "minimal", "two")],
    });
    await nextFrame();
    expect(merged.stdout.lastFrame).toMatch(/akan\s+│ one/);
    expect(merged.stdout.lastFrame).toMatch(/minimal\s+│ two/);

    const withinApp = mount({ prefix: "source", prefixWidth: 6, lines: [lineOf(1, "akan", "served", "#0 all")] });
    await nextFrame();
    expect(withinApp.stdout.lastFrame).toMatch(/#0 all\s+│ served/);

    const withinSource = mount({ prefix: "none", lines: [lineOf(1, "akan", "served", "#0 all")] });
    await nextFrame();
    // The rail still lists `#0 all` as a row; what must be gone is the per-line prefix before `served`.
    expect(withinSource.stdout.lastFrame).toMatch(/│ served/);
    expect(withinSource.stdout.lastFrame).not.toMatch(/#0 all\s+│ served/);
  });

  test("redraws when the store publishes", async () => {
    const harness = mount();
    await nextFrame();
    harness.setSnapshot({ rows: railOf().map((row) => ({ ...row, state: row.state ? "failed" : null })) });
    await nextFrame();
    expect(harness.stdout.lastFrame).toContain("✗");
  });

  test("maps the documented keys to actions", async () => {
    const harness = mount();
    await nextFrame();
    await harness.press("2");
    await harness.press("e");
    await harness.press("c");
    await harness.press("y");
    await harness.press("Y");
    await harness.press("s");
    await harness.press("o");
    await harness.press("r");
    await harness.press("G");
    await harness.press("q");
    expect(harness.calls).toEqual([
      "selectApp:1",
      "toggleErrorsOnly",
      "clear",
      "copyLines",
      "copyPath",
      "copyShareUrl",
      "openSelected",
      "restartSelected",
      "follow",
      "quit",
    ]);
  });

  test("offers the share hint only once a share is open", async () => {
    const harness = mount();
    await nextFrame();
    expect(harness.stdout.lastFrame).not.toContain("s share");

    harness.setSnapshot({ hasShare: true });
    await nextFrame();
    expect(harness.stdout.lastFrame).toContain("s share");
  });

  test("keeps the public URL in the header on a terminal narrow enough to truncate the rest", async () => {
    const harness = mount({
      title: "akan · ◈ https://wispy-fox.tunnel.akanjs.com · http://localhost:8282 · ready",
    });
    await nextFrame();
    expect(harness.stdout.lastFrame).toContain("https://wispy-fox.tunnel.akanjs.com");
    // The pane truncates, so the assertion above only means something while something is being cut.
    expect(harness.stdout.lastFrame).toContain("…");
  });

  test("a copy result takes the footer, and the hints come back with it", async () => {
    const harness = mount();
    await nextFrame();
    expect(harness.stdout.lastFrame).toContain("y copy");

    harness.setSnapshot({ notice: "copied 42 lines" });
    await nextFrame();
    expect(harness.stdout.lastFrame).toContain("copied 42 lines");
    expect(harness.stdout.lastFrame).not.toContain("y copy");

    harness.setSnapshot({ notice: "" });
    await nextFrame();
    expect(harness.stdout.lastFrame).toContain("y copy");
  });

  test("arrows scroll by a line and shift-arrows by a page", async () => {
    const harness = mount({ logRows: 10 });
    await nextFrame();
    await harness.press(`${esc}[A`);
    await harness.press(`${esc}[B`);
    await harness.press(`${esc}[5~`);
    await harness.press(`${esc}[6~`);
    await harness.press(`${esc}[1;2A`);
    expect(harness.calls).toEqual(["scroll:-1", "scroll:1", "scroll:-9", "scroll:9", "scroll:-9"]);
  });

  test("typing goes to the filter while it is open, and never to a command", async () => {
    const harness = mount({ editingGrep: true, grep: "pay" });
    await nextFrame();
    expect(harness.stdout.lastFrame).toContain("grep pay");
    await harness.press("q");
    expect(harness.calls).toEqual(["setGrep:payq"]);
  });
});
