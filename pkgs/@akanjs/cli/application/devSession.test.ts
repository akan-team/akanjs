import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getArgMetas } from "@akanjs/devkit/commandDecorators";
import { stripAnsi } from "@akanjs/devkit/stripAnsi";
import { ApplicationCommand } from "./application.command";
import { DevBootConcurrency } from "./devBootConcurrency";
import { DevLogBuffer, HOST_SOURCE, plainTextOf, sourceOf } from "./devLogBuffer";
import { scrollAnchor, windowOf } from "./devLogWindow";
import { DevPortReclaimer } from "./devPortReclaimer";
import { DevSessionLog } from "./devSessionLog";
import { DevSupervisor } from "./devSupervisor";
import { resolveDevUi } from "./devUiMode";

const tty = { isTty: true, columns: 120 };
const lineOf = (seq: number, app: string, text: string) => ({
  seq,
  app,
  source: HOST_SOURCE,
  kind: "stdout" as const,
  text,
});
const camelToKebabCase = (value: string) => value.replace(/([A-Z])/g, "-$1").toLowerCase();

describe("resolveDevUi", () => {
  test("the full-screen view is the default at every app count", () => {
    expect(resolveDevUi(false, tty)).toEqual({ mode: "tui", downgraded: false });
  });

  test("--plain asks for prefixed lines and is not a downgrade", () => {
    expect(resolveDevUi(true, tty)).toEqual({ mode: "stream", downgraded: false });
    expect(resolveDevUi(true, { isTty: false, columns: 0 }).downgraded).toBe(false);
  });

  test("downgrades rather than refuses when there is no terminal to draw on", () => {
    expect(resolveDevUi(false, { isTty: false, columns: 0 })).toEqual({ mode: "stream", downgraded: true });
    // An unsized pty reports isTTY without a width; Ink cannot lay out against zero columns.
    expect(resolveDevUi(false, { isTty: true, columns: 0 })).toEqual({ mode: "stream", downgraded: true });
  });
});

describe("sourceOf", () => {
  test("reads the replica prefix the gateway writes", () => {
    expect(sourceOf("[child:0 all] [stdout] [McpRouter] #0 123 - hi")).toBe("#0 all");
    expect(sourceOf("[child:2 batch] [stderr] boom")).toBe("#2 batch");
  });

  test("anything without that prefix is the host process's own stdio", () => {
    expect(sourceOf("[AkanApp] 123 - gateway is running")).toBe(HOST_SOURCE);
    expect(sourceOf("   🚀akan - Preparing backend...")).toBe(HOST_SOURCE);
    // Not the prefix: a message that merely mentions a child.
    expect(sourceOf("restarting [child:0 all] soon")).toBe(HOST_SOURCE);
  });
});

describe("DevLogBuffer", () => {
  test("holds a chunk that ends mid-line until the rest arrives", () => {
    const buffer = new DevLogBuffer();
    expect(buffer.push("akan", "stdout", "hello wor")).toEqual([]);
    expect(buffer.push("akan", "stdout", "ld\n").map((line) => line.text)).toEqual(["hello world"]);
  });

  test("splits a multi-line chunk in order", () => {
    const buffer = new DevLogBuffer();
    expect(buffer.push("akan", "stdout", "a\nb\nc\n").map((line) => line.text)).toEqual(["a", "b", "c"]);
  });

  test("keeps stdout and stderr remainders apart", () => {
    const buffer = new DevLogBuffer();
    buffer.push("akan", "stdout", "out-partial");
    buffer.push("akan", "stderr", "err-partial");
    expect(buffer.flushPartials().map((line) => [line.kind, line.text])).toEqual([
      ["stdout", "out-partial"],
      ["stderr", "err-partial"],
    ]);
    expect(buffer.flushPartials()).toEqual([]);
  });

  test("tags each line with its source and lists the ones an app has used", () => {
    const buffer = new DevLogBuffer();
    buffer.push("akan", "stdout", "gateway up\n[child:0 all] [stdout] served\n[child:1 batch] [stdout] queued\n");
    expect(buffer.sourcesOf("akan")).toEqual([HOST_SOURCE, "#0 all", "#1 batch"]);
    expect(buffer.sourcesOf("minimal")).toEqual([]);
    expect(buffer.select({ app: "akan", source: "#1 batch" }).map((line) => line.text)).toEqual([
      "[child:1 batch] [stdout] queued",
    ]);
    expect(buffer.select({ app: "akan", source: HOST_SOURCE }).map((line) => line.text)).toEqual(["gateway up"]);
    expect(buffer.select({ app: "akan" })).toHaveLength(3);
  });

  test("selects by app, and null merges every app", () => {
    const buffer = new DevLogBuffer();
    buffer.push("akan", "stdout", "one\n");
    buffer.push("minimal", "stdout", "two\n");
    expect(buffer.select({ app: "akan" }).map((line) => line.text)).toEqual(["one"]);
    expect(buffer.select({ app: null }).map((line) => line.text)).toEqual(["one", "two"]);
  });

  test("greps past the level colour the child already rendered", () => {
    const buffer = new DevLogBuffer();
    const esc = String.fromCharCode(27);
    buffer.push("akan", "stdout", `${esc}[33mslow ${esc}[39mpayment\n`);
    expect(buffer.select({ grep: "slow payment" })).toHaveLength(1);
    expect(buffer.select({ grep: "SLOW" })).toHaveLength(1);
    // Stored verbatim: stripping on the way in would throw the colour away.
    expect(buffer.select({})[0]?.text).toContain(esc);
    expect(stripAnsi(buffer.select({})[0]?.text ?? "")).toBe("slow payment");
  });

  test("errorsOnly keeps stderr", () => {
    const buffer = new DevLogBuffer();
    buffer.push("akan", "stdout", "fine\n");
    buffer.push("akan", "stderr", "broken\n");
    expect(buffer.select({ errorsOnly: true }).map((line) => line.text)).toEqual(["broken"]);
  });

  test("drops the oldest lines past the limit", () => {
    const buffer = new DevLogBuffer({ limit: 3 });
    buffer.push("akan", "stdout", "1\n2\n3\n4\n5\n");
    expect(buffer.size).toBe(3);
    expect(buffer.select({}).map((line) => line.text)).toEqual(["3", "4", "5"]);
  });

  test("clear takes one app or all of them", () => {
    const buffer = new DevLogBuffer();
    buffer.push("akan", "stdout", "a\n");
    buffer.push("minimal", "stdout", "b\n");
    buffer.clear("akan");
    expect(buffer.select({ app: null }).map((line) => line.text)).toEqual(["b"]);
    buffer.clear();
    expect(buffer.size).toBe(0);
  });
});

const linesOf = (count: number) => {
  const buffer = new DevLogBuffer();
  return buffer.push("akan", "stdout", `${Array.from({ length: count }, (_, idx) => `line-${idx + 1}`).join("\n")}\n`);
};

describe("plainTextOf", () => {
  const red = `${String.fromCharCode(27)}[31m`;
  const reset = `${String.fromCharCode(27)}[0m`;

  test("drops the level colour the child rendered, so a paste is plain text", () => {
    const lines = [lineOf(1, "akan", `${red}boom${reset}`), lineOf(2, "akan", "next")];
    expect(plainTextOf(lines)).toBe("boom\nnext");
  });

  test("names the app only when apps are merged, padded so the lines align", () => {
    const lines = [lineOf(1, "akan", "one"), lineOf(2, "minimal", "two")];
    expect(plainTextOf(lines, { withApp: true })).toBe("akan    \u2502 one\nminimal \u2502 two");
  });

  test("is empty for an empty selection rather than a blank line", () => {
    expect(plainTextOf([])).toBe("");
  });
});

describe("DevSessionLog", () => {
  const openIn = async (root: string, apps: string[]) => {
    const log = new DevSessionLog({ workspaceRoot: root, apps, now: () => new Date("2026-09-09T14:03:11") });
    await log.open();
    return log;
  };
  const makeRoot = async () => await mkdtemp(path.join(tmpdir(), "akan-session-log-"));

  test("writes one file per app under that app's runtime dir", async () => {
    const root = await makeRoot();
    const log = await openIn(root, ["minimal"]);
    expect(log.relativePathOf("minimal")).toBe(path.join("local", "apps", "minimal", "runtime", "dev.log"));
    log.write("minimal", "stdout", "gateway is running\n");
    await log.close();
    expect(await readFile(log.pathOf("minimal"), "utf8")).toBe(
      "\u2500\u2500 akan start \u00b7 minimal \u00b7 2026-09-09 14:03:11 \u2500\u2500\ngateway is running\n",
    );
  });

  test("holds a chunk that ends mid-line, and writes the remainder on close", async () => {
    const root = await makeRoot();
    const log = await openIn(root, ["minimal"]);
    log.write("minimal", "stdout", "hello wor");
    log.write("minimal", "stdout", "ld\nno newline here");
    await log.close();
    const written = (await readFile(log.pathOf("minimal"), "utf8")).split("\n").slice(1);
    expect(written).toEqual(["hello world", "no newline here", ""]);
  });

  test("strips the ANSI a child rendered, so the file is what a paste would be", async () => {
    const root = await makeRoot();
    const log = await openIn(root, ["minimal"]);
    log.write("minimal", "stderr", `${String.fromCharCode(27)}[31mboom${String.fromCharCode(27)}[0m\n`);
    await log.close();
    expect(await readFile(log.pathOf("minimal"), "utf8")).toContain("\nboom\n");
  });

  test("moves the last session aside rather than writing over it", async () => {
    const root = await makeRoot();
    const first = await openIn(root, ["minimal"]);
    first.write("minimal", "stdout", `${"long line ".repeat(20)}\n`);
    await first.close();

    const second = await openIn(root, ["minimal"]);
    second.write("minimal", "stdout", "short\n");
    await second.close();

    // `Bun.file().writer()` opens at offset 0 without truncating, so a leftover tail is the failure here.
    expect(await readFile(second.pathOf("minimal"), "utf8")).toEndWith("short\n");
    expect(await readFile(second.previousPathOf("minimal"), "utf8")).toContain("long line");
  });

  test("a note is session-level and lands in every app's file", async () => {
    const root = await makeRoot();
    const log = await openIn(root, ["akan", "minimal"]);
    log.note("booting 2 apps at a time");
    await log.close();
    for (const app of ["akan", "minimal"])
      expect(await readFile(log.pathOf(app), "utf8")).toContain("[akan] booting 2 apps at a time");
  });

  test("records a state transition once, not once per status publish", async () => {
    const root = await makeRoot();
    const log = await openIn(root, ["minimal"]);
    const status = {
      name: "minimal",
      url: "http://localhost:8391",
      state: "ready",
      detail: "",
    } as unknown as Parameters<DevSessionLog["status"]>[0][number];
    log.status([status]);
    log.status([status]);
    await log.close();
    const readyLines = (await readFile(log.pathOf("minimal"), "utf8"))
      .split("\n")
      .filter((line) => line.includes("minimal ready"));
    expect(readyLines).toEqual(["[akan] minimal ready \u2014 http://localhost:8391"]);
  });

  test("survives an app whose runtime dir does not exist yet", async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, "marker"), "");
    const log = await openIn(root, ["brand-new"]);
    log.write("brand-new", "stdout", "up\n");
    await log.close();
    expect(await readFile(log.pathOf("brand-new"), "utf8")).toContain("up");
  });
});

describe("devLogWindow", () => {
  test("follows the tail with no anchor", () => {
    const view = windowOf(linesOf(10), 3, null);
    expect(view.lines.map((line) => line.text)).toEqual(["line-8", "line-9", "line-10"]);
    expect([view.above, view.below, view.following]).toEqual([7, 0, true]);
  });

  test("shows everything when the log is shorter than the pane", () => {
    const view = windowOf(linesOf(2), 5, null);
    expect(view.lines).toHaveLength(2);
    expect([view.above, view.below]).toEqual([0, 0]);
  });

  test("an anchor pins the window and counts what is hidden either side", () => {
    const lines = linesOf(10);
    const anchor = lines[5]?.seq ?? null;
    const view = windowOf(lines, 3, anchor);
    expect(view.lines.map((line) => line.text)).toEqual(["line-4", "line-5", "line-6"]);
    expect([view.above, view.below, view.following]).toEqual([3, 4, false]);
  });

  test("scrolling up leaves following, and back down resumes it", () => {
    const lines = linesOf(10);
    const up = scrollAnchor(lines, 3, null, -2);
    expect(up).toBe(lines[7]?.seq);
    expect(windowOf(lines, 3, up).lines.map((line) => line.text)).toEqual(["line-6", "line-7", "line-8"]);
    expect(scrollAnchor(lines, 3, up, 2)).toBeNull();
    // Past the end is still just "following", never an out-of-range anchor.
    expect(scrollAnchor(lines, 3, up, 99)).toBeNull();
  });

  test("cannot scroll above the first page", () => {
    const lines = linesOf(10);
    const top = scrollAnchor(lines, 3, null, -99);
    expect(windowOf(lines, 3, top).lines.map((line) => line.text)).toEqual(["line-1", "line-2", "line-3"]);
    expect(scrollAnchor(lines, 3, top, -1)).toBe(top);
  });

  test("a log that fits the pane has nothing to scroll", () => {
    expect(scrollAnchor(linesOf(2), 5, null, -3)).toBeNull();
  });

  test("an anchored line evicted from the ring falls back to the oldest page", () => {
    const lines = linesOf(10);
    // Anchor at a seq older than anything still held.
    const view = windowOf(lines.slice(5), 3, lines[0]?.seq ?? 0);
    expect(view.lines.map((line) => line.text)).toEqual(["line-6", "line-7", "line-8"]);
  });
});

describe("DevPortReclaimer", () => {
  test("covers the websocket port a gateway also binds", () => {
    expect(DevPortReclaimer.portsFor([8282, 8283])).toEqual([8282, 8283, 18282, 18283]);
    expect(DevPortReclaimer.portsFor([8282, 8282])).toEqual([8282, 18282]);
  });

  test("recognises an akan dev tree", () => {
    for (const command of [
      "bun /Users/x/.bun/bin/akan start akan",
      "bun dist/pkgs/@akanjs/cli/index.js start akan",
      "bun apps/minimal/main.ts",
      "bun /repo/pkgs/@akanjs/devkit/incrementalBuilder/incrementalBuilder.proc.ts",
      "bun --conditions react-server /repo/node_modules/akanjs/server/rscWorker.tsx",
      '"C:\\Users\\u\\.bun\\bin\\bun.exe" C:\\w\\dist\\pkgs\\@akanjs\\cli\\index.js start akan',
      '"C:\\Users\\u\\.bun\\bin\\akan.exe" start akan',
      "C:\\Users\\u\\.bun\\bin\\bun.exe C:\\w\\apps\\minimal\\main.ts",
    ])
      expect([command, DevPortReclaimer.isAkanCommand(command)]).toEqual([command, true]);
  });

  test("does not claim a foreign holder", () => {
    for (const command of ["postgres: primary", "/usr/bin/ssh -L 8282:localhost:8282 host", "node server.js"])
      expect([command, DevPortReclaimer.isAkanCommand(command)]).toEqual([command, false]);
  });

  test("reports a free port as nothing to do", async () => {
    // 1 is privileged and never a dev port, so no holder can be found for it.
    const report = await new DevPortReclaimer().reclaim([1]);
    expect(report).toEqual({ killed: [], foreign: [] });
  });
});

describe("DevSupervisor.childArgs", () => {
  test("names only options the start command declares", () => {
    const [argMetas] = getArgMetas(ApplicationCommand, "start");
    const declared = new Set(
      argMetas
        .filter((meta): meta is Extract<typeof meta, { name: string }> => meta.type === "Option")
        .map((meta) => `--${camelToKebabCase(meta.name)}`),
    );
    const used = DevSupervisor.childArgs("minimal", { write: false }).filter((arg) => arg.startsWith("--"));
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((arg) => !declared.has(arg))).toEqual([]);
  });

  test("tells the child not to render or touch the database", () => {
    const args = DevSupervisor.childArgs("minimal", { write: true });
    expect(args.slice(0, 2)).toEqual(["start", "minimal"]);
    expect(args).toContain("--plain");
    expect(args.slice(args.indexOf("--dbup"), args.indexOf("--dbup") + 2)).toEqual(["--dbup", "false"]);
    expect(args.slice(args.indexOf("--write"), args.indexOf("--write") + 2)).toEqual(["--write", "true"]);
  });
});

describe("DevBootConcurrency", () => {
  const laptop = { memoryBytes: 48 * 1024 ** 3, cores: 14 };
  const container = { memoryBytes: 1.2 * 1024 ** 3, cores: 2 };

  test("an explicit number wins, clamped to the app count and to at least one", () => {
    expect(DevBootConcurrency.resolve(4, 2, container).concurrency).toBe(2);
    expect(DevBootConcurrency.resolve(2, 9, container).concurrency).toBe(2);
    expect(DevBootConcurrency.resolve(3, 0, laptop).concurrency).toBe(1);
    expect(DevBootConcurrency.resolve(3, 2, laptop).reason).toBe("--concurrency 2");
  });

  test("a small container still staggers the boot", () => {
    expect(DevBootConcurrency.resolve(3, null, container).concurrency).toBe(1);
  });

  test("a roomy machine boots them together, up to what its cores can build", () => {
    expect(DevBootConcurrency.resolve(2, null, laptop).concurrency).toBe(2);
    expect(DevBootConcurrency.resolve(9, null, laptop).concurrency).toBe(3);
  });

  test("memory bounds it independently of cores", () => {
    expect(DevBootConcurrency.resolve(8, null, { memoryBytes: 4 * 1024 ** 3, cores: 64 }).concurrency).toBe(2);
    expect(DevBootConcurrency.resolve(8, null, { memoryBytes: 256 * 1024 ** 3, cores: 8 }).concurrency).toBe(2);
  });

  test("the note names the wave size and why", () => {
    const plan = DevBootConcurrency.resolve(9, null, laptop);
    expect(DevBootConcurrency.describe(9, plan)).toBe(
      "booting 3 of 9 apps at a time (14 cores, 48GB memory) — --concurrency raises it",
    );
    expect(DevBootConcurrency.describe(2, DevBootConcurrency.resolve(2, null, laptop))).toBe(
      "booting all 2 apps at once (14 cores, 48GB memory)",
    );
  });

  test("start leaves the option unset rather than defaulting it, so the machine gets to answer", () => {
    const [argMetas] = getArgMetas(ApplicationCommand, "start");
    const concurrency = argMetas.find(
      (meta): meta is Extract<typeof meta, { name: string }> => meta.type === "Option" && meta.name === "concurrency",
    );
    expect(concurrency?.argsOption.default).toBeUndefined();
    expect(concurrency?.argsOption.nullable).toBe(true);
  });

  test("the budget never exceeds the container the session runs in", () => {
    const previous = process.env.AKAN_MEMORY_LIMIT;
    process.env.AKAN_MEMORY_LIMIT = "1200mb";
    try {
      expect(DevBootConcurrency.budget().memoryBytes).toBe(1200 * 1024 * 1024);
    } finally {
      if (previous === undefined) delete process.env.AKAN_MEMORY_LIMIT;
      else process.env.AKAN_MEMORY_LIMIT = previous;
    }
  });
});
