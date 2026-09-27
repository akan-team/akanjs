import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { checkLimit, checkName, checkSaveSource, checkTypes, isFileRef } from "../src/common.ts";
import { createDesktopFilePicker, listFiles } from "../src/desktop.ts";
import { filePicker } from "../src/index.ts";
import { acceptAttribute, directoryResult } from "../src/web.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code;
  }
};
const code = async (p: Promise<unknown>) =>
  (
    (await p.then(
      () => null,
      (e: unknown) => e,
    )) as { code?: string } | null
  )?.code ?? "resolved";

describe("argument rules (shared with Swift and Kotlin)", () => {
  test("types: MIME types or extensions, normalized", () => {
    expect(checkTypes(undefined)).toEqual([]);
    expect(checkTypes(["image/*", ".PDF", "csv", "application/vnd.ms-excel", "pdf", "tar.gz"])).toEqual([
      "image/*",
      "pdf",
      "csv",
      "application/vnd.ms-excel",
      "tar.gz",
    ]);
    expect(checkTypes(["pdf", "*/*"])).toEqual([]); // anything
    for (const bad of ["pdf", [""], ["a b"], ["image/"], ["/png"], ["x/y/z"], [".."], [3], ["*"], ["image/**"]]) {
      expect(codeOf(() => checkTypes(bad))).toBe("INVALID_ARGS");
    }
    expect(acceptAttribute(["image/*", "pdf"])).toBe("image/*,.pdf");
  });

  test("names, limits and save sources", () => {
    expect(checkName("Report 2026.csv")).toBe("Report 2026.csv");
    expect(checkName("한글.txt")).toBe("한글.txt");
    for (const bad of ["", "  ", "a/b", "..", ".", "a\\b", "a\nb", "x".repeat(256), 5])
      expect(codeOf(() => checkName(bad))).toBe("INVALID_ARGS");
    expect(checkLimit(undefined)).toBe(1000);
    expect(checkLimit(1)).toBe(1);
    for (const bad of [0, 1.5, 10001, "5", true]) expect(codeOf(() => checkLimit(bad))).toBe("INVALID_ARGS");
    expect(checkSaveSource({ data: "a,b\n" })).toEqual({ kind: "data", data: "a,b\n", encoding: "utf8" });
    for (const bad of [
      {},
      { data: "x", url: "y" },
      { data: "!!", encoding: "base64" },
      { url: "u", encoding: "utf8" },
      { data: 1 },
    ]) {
      expect(codeOf(() => checkSaveSource(bad))).toBe("INVALID_ARGS");
    }
    expect(isFileRef("/__akan_native/file/f1_ab.jpg")).toBe(true);
    expect(isFileRef("https://app.localhost/__akan_native/file/f1")).toBe(true);
    expect(isFileRef("blob:app://localhost/1")).toBe(false);
  });
});

describe("routing", () => {
  test("native hosts get the options and return FileRefs with names", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: {
        "file-picker": {
          methods: {
            pickFiles: (args) => (
              seen.push(args),
              { files: [{ url: "/__akan_native/file/a.pdf", mime: "application/pdf", size: 3, name: "A.pdf" }] }
            ),
            saveFile: (args) => (seen.push(args), { saved: true, name: "out (1).csv" }),
            pickDirectory: () => ({ name: null, files: [], truncated: false }),
          },
        },
      },
    });
    expect((await filePicker.pickFiles({ types: ["pdf"], multiple: true })).files[0]!.name).toBe("A.pdf");
    expect(seen.at(-1)).toEqual({ types: ["pdf"], multiple: true });
    expect(await filePicker.saveFile({ name: "out.csv", url: "/__akan_native/file/f2.csv" })).toEqual({
      saved: true,
      name: "out (1).csv",
    });
    expect(seen.at(-1)).toEqual({ name: "out.csv", url: "/__akan_native/file/f2.csv" }); // FileRef: read natively
    expect(await filePicker.pickDirectory()).toEqual({ name: null, files: [], truncated: false });
  });

  test("other URLs are fetched by the page and sent as base64", async () => {
    const seen: Record<string, unknown>[] = [];
    host = installMockHost({
      platform: "android",
      plugins: { "file-picker": { methods: { saveFile: (args) => (seen.push(args), { saved: false }) } } },
    });
    const url = URL.createObjectURL(new Blob(["a,b"], { type: "text/csv" }));
    try {
      await filePicker.saveFile({ name: "x.csv", url });
      expect(seen.at(-1)).toEqual({ name: "x.csv", mime: "text/csv", data: "YSxi", encoding: "base64" });
    } finally {
      URL.revokeObjectURL(url);
    }
    host.uninstall();
    host = installMockHost({
      platform: "macos",
      plugins: { "file-picker": { methods: { saveFile: (args) => (seen.push(args), { saved: true, name: "x" }) } } },
    });
    await filePicker.saveFile({ name: "x.txt", url: "data:text/plain,hi", mime: "text/plain" });
    expect(seen.at(-1)).toEqual({ name: "x.txt", mime: "text/plain", data: "aGk=", encoding: "base64" });
    expect(await code(filePicker.saveFile({ name: "x", url: "blob:nope" }))).toBe("NOT_FOUND");
  });

  test("iOS: text starting with a byte order mark goes as base64", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: { "file-picker": { methods: { saveFile: (args) => (seen.push(args), { saved: false }) } } },
    });
    await filePicker.saveFile({ name: "a.csv", data: "\uFEFFa,b" });
    expect(seen.at(-1)).toEqual({ name: "a.csv", data: "77u/YSxi", encoding: "base64" });
  });

  test("manifest: every platform has all three methods", () => {
    const plugin = { spec: "file-picker", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["macos", "ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({
        "file-picker": { methods: ["pickFiles", "saveFile", "pickDirectory"], events: [] },
      });
    }
    expect(manifest.methods).toEqual([...filePicker.methods]);
  });
});

describe("web", () => {
  test("argument errors come before any dialog; no document is UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    expect(filePicker.implementation("pickFiles")).toBe("web");
    expect(await code(filePicker.pickFiles({ types: "pdf" as never }))).toBe("INVALID_ARGS");
    expect(await code(filePicker.saveFile({ name: "a/b", data: "x" }))).toBe("INVALID_ARGS");
    expect(await code(filePicker.pickFiles())).toBe("UNSUPPORTED");
    expect(await code(filePicker.saveFile({ name: "a.txt", data: "x" }))).toBe("UNSUPPORTED");
    expect(await code(filePicker.pickDirectory())).toBe("UNSUPPORTED");
  });

  test("webkitdirectory files become a folder snapshot", () => {
    const file = (path: string, body = "x") => {
      const f = new File([body], path.split("/").pop()!, { type: path.endsWith(".png") ? "image/png" : "" });
      Object.defineProperty(f, "webkitRelativePath", { value: path });
      return f;
    };
    const files = [
      file("Trip/a.png"),
      file("Trip/.DS_Store"),
      file("Trip/.git/config"),
      file("Trip/day 2/b.txt", "hello"),
    ];
    const result = directoryResult(files, 10);
    expect(result.name).toBe("Trip");
    expect(result.truncated).toBe(false);
    expect(result.files.map((f) => [f.path, f.name, f.mime, f.size])).toEqual([
      ["a.png", "a.png", "image/png", 1],
      ["day 2/b.txt", "b.txt", "application/octet-stream", 5],
    ]);
    expect(result.files[0]!.url.startsWith("blob:")).toBe(true);
    expect(directoryResult(files, 1)).toMatchObject({ truncated: true, files: [{ path: "a.png" }] });
  });
});

// ---------------------------------------------------------------- desktop (macOS)

describe("desktop", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "akan-native-picker-")));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(join(tmpdir(), "dev.test.picker"), { recursive: true, force: true }); // the staged copies
  });
  const registered: string[] = [];

  /** The plugin with a fake shell: the panel "answers" with `answer`; UTType gives these MIME types. */
  const withAnswer = (answer: Record<string, unknown>) => {
    const shellCalls: { op: string; args: Record<string, unknown> }[] = [];
    let release: (() => void) | null = null;
    const ctx = {
      app: { id: "dev.test.picker", name: "Test", version: "1.0.0" },
      appDataDir: join(root, "app"),
      registerFile(path: string, mime: string) {
        registered.push(path);
        return { url: `/__akan_native/file/r${registered.length}`, mime, size: readFileSync(path).length };
      },
      shell: async (op: string, args: Record<string, unknown>) => {
        shellCalls.push({ op, args });
        if (op === "panel.mime") return { pdf: "application/pdf", txt: "text/plain", png: "image/png" };
        if (answer.hold) await new Promise<void>((r) => (release = r));
        return answer;
      },
    } as unknown as DesktopContext;
    const plugin = createDesktopFilePicker();
    const m = plugin.methods as Record<string, (args: unknown, ctx: DesktopContext) => Promise<any>>;
    return {
      shellCalls,
      release: () => release?.(),
      call: (method: string, args?: unknown) => Promise.resolve().then(() => m[method]!(args, ctx)),
    };
  };

  const macOnly = process.platform === "darwin" ? test : test.skip;

  macOnly("pickFiles copies the picked files and serves the copies", async () => {
    const src = join(root, "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "보고서.pdf"), "%PDF");
    writeFileSync(join(src, "b.txt"), "hello");
    const { shellCalls, call } = withAnswer({ paths: [join(src, "보고서.pdf"), join(src, "b.txt")] });
    const { files } = await call("pickFiles", { types: ["pdf", "text/plain"], multiple: true });
    expect(files.map((f: { name: string; mime: string; size: number }) => [f.name, f.mime, f.size])).toEqual([
      ["보고서.pdf", "application/pdf", 4],
      ["b.txt", "text/plain", 5],
    ]);
    expect(shellCalls[0]).toEqual({ op: "panel.open", args: { types: ["pdf", "text/plain"], multiple: true } });
    expect(shellCalls[1]).toEqual({ op: "panel.mime", args: { exts: ["pdf", "txt"] } });
    const copy = registered.at(-2)!;
    expect(copy.startsWith(join(tmpdir(), "dev.test.picker", "file-picker"))).toBe(true);
    expect(readFileSync(copy, "utf8")).toBe("%PDF");
  });

  macOnly("saveFile writes where the user chose", async () => {
    const target = join(root, "out", "저장 파일.csv");
    mkdirSync(join(root, "out"), { recursive: true });
    const { shellCalls, call } = withAnswer({ path: target });
    expect(await call("saveFile", { name: "export.csv", data: "a,b\n" })).toEqual({
      saved: true,
      name: "저장 파일.csv",
    });
    expect(readFileSync(target, "utf8")).toBe("a,b\n");
    expect(await call("saveFile", { name: "export.csv", data: "AP8=", encoding: "base64" })).toEqual({
      saved: true,
      name: "저장 파일.csv",
    }); // replaces
    expect([...readFileSync(target)]).toEqual([0, 255]);
    expect(shellCalls[0]).toEqual({ op: "panel.save", args: { name: "export.csv" } });
    expect(await code(call("saveFile", { name: "x", url: "/__akan_native/file/a" }))).toBe("INVALID_ARGS");
  });

  macOnly("pickDirectory returns a snapshot without hidden files", async () => {
    const dir = join(root, "Trip");
    mkdirSync(join(dir, "day 2"), { recursive: true });
    mkdirSync(join(dir, ".git"), { recursive: true });
    writeFileSync(join(dir, "a.png"), "png");
    writeFileSync(join(dir, "day 2", "b.txt"), "b");
    writeFileSync(join(dir, ".git", "config"), "c");
    writeFileSync(join(dir, ".DS_Store"), "d");
    const { shellCalls, call } = withAnswer({ paths: [dir] });
    const result = await call("pickDirectory", { limit: 10 });
    expect(shellCalls[0]).toEqual({ op: "panel.open", args: { directory: true } });
    expect(result.name).toBe("Trip");
    expect(result.truncated).toBe(false);
    expect(result.files.map((f: { path: string; mime: string }) => [f.path, f.mime])).toEqual([
      ["a.png", "image/png"],
      ["day 2/b.txt", "text/plain"],
    ]);
    const one = await call("pickDirectory", { limit: 1 });
    expect([one.files.length, one.truncated]).toEqual([1, true]);
    expect(listFiles(dir, 5)).toEqual({ files: ["a.png", "day 2/b.txt"], truncated: false });
  });

  test("closing the panel resolves empty; bad arguments reject before any panel", async () => {
    const { shellCalls, call } = withAnswer({ cancelled: true });
    if (process.platform === "darwin") {
      expect(await call("pickFiles")).toEqual({ files: [] });
      expect(await call("saveFile", { name: "a.txt", data: "x" })).toEqual({ saved: false });
      expect(await call("pickDirectory")).toEqual({ name: null, files: [], truncated: false });
    }
    const before = shellCalls.length;
    expect(await code(call("pickFiles", { types: [1] }))).toBe("INVALID_ARGS");
    expect(await code(call("saveFile", { name: "../x", data: "x" }))).toBe("INVALID_ARGS");
    expect(await code(call("pickDirectory", { limit: 0 }))).toBe("INVALID_ARGS");
    expect(shellCalls.length).toBe(before);
  });

  macOnly("one panel at a time", async () => {
    const f = withAnswer({ cancelled: true, hold: true });
    const first = f.call("pickFiles");
    await Bun.sleep(5);
    expect(await code(f.call("pickFiles"))).toBe("CANCELLED");
    f.release();
    expect(await first).toEqual({ files: [] });
  });
});
