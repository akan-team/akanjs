import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { resolveGrant } from "../../../packages/desktop/src/grants.ts";
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

  test("forServer is for a desktop app's server: a phone or the web refuses it before any dialog", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: { "file-picker": { methods: { pickFiles: (args) => (seen.push(args), { files: [] }) } } },
    });
    expect(await code(filePicker.pickFiles({ forServer: true }))).toBe("UNSUPPORTED");
    expect(await code(filePicker.pickDirectory({ forServer: true }))).toBe("UNSUPPORTED");
    expect(await code(filePicker.saveFile({ name: "out.mp4", forServer: true }))).toBe("UNSUPPORTED");
    expect(seen).toEqual([]);
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
  const withAnswer = (
    answer: Record<string, unknown>,
    { dev = false, server = false }: { dev?: boolean; server?: boolean } = {},
  ) => {
    const shellCalls: { op: string; args: Record<string, unknown> }[] = [];
    let release: (() => void) | null = null;
    const ctx = {
      app: { id: "dev.test.picker", name: "Test", version: "1.0.0" },
      dev,
      server: server ? { ready: Promise.resolve(true) } : null,
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

  test("forServer copies nothing: the originals are served and granted to the app's server", async () => {
    const src = join(root, "footage");
    mkdirSync(join(src, "day1"), { recursive: true });
    writeFileSync(join(src, "trip.mov"), "moov");
    writeFileSync(join(src, "day1", "a.mp4"), "mp4");
    const picked = await withAnswer({ paths: [join(src, "trip.mov")] }).call("pickFiles", { forServer: true });
    expect(registered.at(-1)).toBe(join(src, "trip.mov"));
    expect(picked.files[0].name).toBe("trip.mov");
    expect(resolveGrant(picked.files[0].grant)).toEqual({ path: join(src, "trip.mov"), mode: "read" });

    const folder = await withAnswer({ paths: [src] }).call("pickDirectory", { forServer: true });
    expect(resolveGrant(folder.grant)).toEqual({ path: src, mode: "folder" });
    expect(folder.files.map((f: { path: string }) => f.path)).toEqual(["day1/a.mp4", "trip.mov"]);
    expect(registered.slice(-2)).toEqual([join(src, "day1", "a.mp4"), join(src, "trip.mov")]);

    const target = join(root, "export", "cut.mp4");
    const saved = await withAnswer({ path: target }).call("saveFile", { name: "cut.mp4", forServer: true });
    expect(saved).toMatchObject({ saved: true, name: "cut.mp4" });
    expect(resolveGrant(saved.grant)).toEqual({ path: target, mode: "write" });
    expect(await code(withAnswer({ path: target }).call("saveFile", { name: "x", data: "a", forServer: true }))).toBe(
      "INVALID_ARGS",
    );
  });

  test("a dev build's grant carries the path, since its server is not the shell's child", async () => {
    const home = mkdtempSync(join(tmpdir(), "akan-native-grant-home-"));
    process.env.AKAN_NATIVE_DEV_GRANT_KEY = join(home, "dev-file-grant.key");
    try {
      mkdirSync(join(root, "grant-src"), { recursive: true });
      writeFileSync(join(root, "grant-src", "b.txt"), "hello");
      const picked = await withAnswer({ paths: [join(root, "grant-src", "b.txt")] }, { dev: true }).call("pickFiles", {
        forServer: true,
      });
      const [head, mode, encoded, signature] = picked.files[0].grant.split(":");
      expect([head, mode, Buffer.from(encoded, "base64url").toString()]).toEqual([
        "dev",
        "read",
        join(root, "grant-src", "b.txt"),
      ]);
      expect(signature.length).toBeGreaterThan(40);
      expect(resolveGrant(picked.files[0].grant)).toBeNull();
    } finally {
      delete process.env.AKAN_NATIVE_DEV_GRANT_KEY;
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("a debug build that carries its server grants over IPC like a release build: that server refuses a dev grant", async () => {
    mkdirSync(join(root, "grant-src"), { recursive: true });
    writeFileSync(join(root, "grant-src", "c.txt"), "hello");
    const withServer = { dev: true, server: true };
    const picked = await withAnswer({ paths: [join(root, "grant-src", "c.txt")] }, withServer).call("pickFiles", {
      forServer: true,
    });
    expect(picked.files[0].grant.startsWith("dev:")).toBe(false);
    expect(resolveGrant(picked.files[0].grant)).toEqual({ path: join(root, "grant-src", "c.txt"), mode: "read" });
    const folder = await withAnswer({ paths: [join(root, "grant-src")] }, withServer).call("pickDirectory", {
      forServer: true,
    });
    expect(resolveGrant(folder.grant)).toEqual({ path: join(root, "grant-src"), mode: "folder" });
    const target = join(root, "export", "debug.mp4");
    const saved = await withAnswer({ path: target }, withServer).call("saveFile", {
      name: "debug.mp4",
      forServer: true,
    });
    expect(resolveGrant(saved.grant)).toEqual({ path: target, mode: "write" });
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
