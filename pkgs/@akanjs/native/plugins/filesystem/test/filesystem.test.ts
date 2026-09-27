import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { type FileRef, isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import {
  base64ToBytes,
  bytesToBase64,
  checkBase64,
  checkPath,
  checkWriteSource,
  fileRefId,
  mimeFor,
} from "../src/common.ts";
import { baseDirs, createDesktopFilesystem } from "../src/desktop.ts";
import { type BaseDirectory, filesystem } from "../src/index.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code;
  }
};
const code = async (p: Promise<unknown>) => ((await rejection(p)) as { code?: string } | null)?.code ?? "resolved";

describe("argument rules (shared with Swift and Kotlin)", () => {
  test("paths stay inside their base by spelling", () => {
    expect(checkPath("a/b.txt", false)).toEqual(["a", "b.txt"]);
    expect(checkPath("./a//b/", false)).toEqual(["a", "b"]);
    expect(checkPath("", true)).toEqual([]);
    expect(checkPath("..a/b..", false)).toEqual(["..a", "b.."]); // only a whole ".." segment is special
    for (const bad of ["/etc/passwd", "a/../b", "..", "a\\b", "a\0b", 5, null])
      expect(codeOf(() => checkPath(bad, false))).toBe("INVALID_ARGS");
    expect(codeOf(() => checkPath("", false))).toBe("INVALID_ARGS");
    expect(codeOf(() => checkPath("./", false))).toBe("INVALID_ARGS");
  });

  test("base64 is strict", () => {
    for (const ok of ["", "AA==", "AAA=", "AAAA", "AA", "AAA", "+/+/"])
      expect(codeOf(() => checkBase64(ok))).toBeNull();
    for (const bad of ["A", "AAAAA", "AA=", "A===", "AA AA", "AA\n", "-_-_", "AA==AA", "é"])
      expect(codeOf(() => checkBase64(bad))).toBe("INVALID_ARGS");
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    expect(base64ToBytes("AAE")).toEqual(new Uint8Array([0, 1]));
  });

  test("write sources", () => {
    expect(checkWriteSource({ data: "hi" })).toEqual({ kind: "data", data: "hi", encoding: "utf8" });
    expect(checkWriteSource({ data: "AA==", encoding: "base64" })).toEqual({
      kind: "data",
      data: "AA==",
      encoding: "base64",
    });
    expect(checkWriteSource({ url: "/__akan_native/file/f1.jpg" })).toEqual({
      kind: "url",
      url: "/__akan_native/file/f1.jpg",
    });
    for (const bad of [
      {},
      { data: "a", url: "b" },
      { data: 1 },
      { data: "!", encoding: "base64" },
      { data: "a", encoding: "latin1" },
      { url: "" },
      { url: "x", encoding: "utf8" },
    ]) {
      expect(codeOf(() => checkWriteSource(bad))).toBe("INVALID_ARGS");
    }
  });

  test("FileRef URLs and MIME types", () => {
    expect(fileRefId("/__akan_native/file/f1_ab.jpg")).toBe("f1_ab.jpg");
    expect(fileRefId("app://localhost/__akan_native/file/abc")).toBe("abc");
    expect(fileRefId("https://app.localhost/__akan_native/file/abc.png")).toBe("abc.png");
    expect(fileRefId("https://evil.test/__akan_native/file/abc")).toBeNull();
    expect(fileRefId("blob:app://localhost/1")).toBeNull();
    expect(fileRefId("/__akan_native/file/../x")).toBeNull();
    expect(mimeFor("a.PDF")).toBe("application/pdf");
    expect(mimeFor("notes.txt")).toBe("text/plain");
    expect(mimeFor(".env")).toBe("application/octet-stream");
    expect(mimeFor("README")).toBe("application/octet-stream");
  });
});

describe("routing", () => {
  test("native hosts get the arguments unchanged", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "android",
      plugins: {
        filesystem: {
          methods: {
            readFile: (args) => (
              seen.push(args),
              args.encoding ? { data: "hello" } : { url: "/__akan_native/file/f1.txt", mime: "text/plain", size: 5 }
            ),
            writeFile: (args) => void seen.push(args),
            paths: () => ({ data: "/data/user/0/x/files", cache: "c", documents: "d", temp: "t" }),
          },
        },
      },
    });
    expect(await filesystem.readFile({ path: "a.txt", base: "data", encoding: "utf8" })).toEqual({ data: "hello" });
    const ref: FileRef = await filesystem.readFile({ path: "a.txt", base: "data" });
    expect(ref.url).toBe("/__akan_native/file/f1.txt");
    // A FileRef of the session is copied natively on iOS and Android: passed through.
    await filesystem.writeFile({ path: "copy.jpg", base: "documents", url: "/__akan_native/file/f2.jpg" });
    expect(seen.at(-1)).toEqual({ path: "copy.jpg", base: "documents", url: "/__akan_native/file/f2.jpg" });
    expect((await filesystem.paths()).data).toBe("/data/user/0/x/files");
  });

  test("other URLs are fetched by the page and sent as base64", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: { filesystem: { methods: { writeFile: (args) => void seen.push(args) } } },
    });
    const url = URL.createObjectURL(new Blob([new Uint8Array([1, 2, 3])]));
    try {
      await filesystem.writeFile({ path: "b.bin", base: "cache", url, append: true });
      expect(seen.at(-1)).toEqual({ path: "b.bin", base: "cache", append: true, data: "AQID", encoding: "base64" });
    } finally {
      URL.revokeObjectURL(url);
    }
    // macOS: even FileRefs, since the Bun host cannot look them up
    host.uninstall();
    host = installMockHost({
      platform: "macos",
      plugins: { filesystem: { methods: { writeFile: (args) => void seen.push(args) } } },
    });
    await filesystem.writeFile({ path: "c.txt", base: "data", url: "data:text/plain,hi" });
    expect(seen.at(-1)).toEqual({ path: "c.txt", base: "data", data: "aGk=", encoding: "base64" });
    expect(await code(filesystem.writeFile({ path: "d", base: "data", url: `data:,${"x".repeat(3)}` }))).toBe(
      "resolved",
    );
  });

  test("iOS: text starting with a byte order mark goes as base64 (the bridge's JSON parser drops it)", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: { filesystem: { methods: { writeFile: (args) => void seen.push(args) } } },
    });
    await filesystem.writeFile({ path: "a.txt", base: "data", data: "\uFEFFhi" });
    expect(seen.at(-1)).toEqual({ path: "a.txt", base: "data", data: "77u/aGk=", encoding: "base64" });
    await filesystem.writeFile({ path: "a.txt", base: "data", data: "hi\uFEFF" }); // only a leading one is dropped
    expect(seen.at(-1)).toEqual({ path: "a.txt", base: "data", data: "hi\uFEFF" });
    host.uninstall();
    host = installMockHost({
      platform: "android",
      plugins: { filesystem: { methods: { writeFile: (args) => void seen.push(args) } } },
    });
    await filesystem.writeFile({ path: "a.txt", base: "data", data: "\uFEFFhi" });
    expect(seen.at(-1)).toEqual({ path: "a.txt", base: "data", data: "\uFEFFhi" });
  });

  test("unsupported without a host implementation", async () => {
    host = installMockHost({ platform: "android", plugins: {} });
    expect(await code(filesystem.readDir({ path: "", base: "data" }))).toBe("UNSUPPORTED");
  });

  test("manifest: desktop runs in Bun, mobile is native, all methods everywhere", () => {
    const plugin = { spec: "filesystem", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["macos", "ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({ filesystem: { methods: manifest.methods, events: [] } });
    }
    expect(manifest.methods).toEqual([...filesystem.methods]);
  });
});

// ---------------------------------------------------------------- desktop (Bun) against temp dirs

describe("desktop", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "akan-native-fs-")));
  const outside = join(root, "outside");
  const dirs: Record<BaseDirectory, string> = {
    data: join(root, "data"),
    cache: join(root, "cache"),
    documents: join(root, "documents"),
    temp: join(root, "temp"),
  };
  const registered: [string, string][] = [];
  const ctx = {
    app: { id: "dev.test", name: "Test", version: "1.0.0" },
    appDataDir: join(root, "app"),
    registerFile(path: string, mime: string) {
      registered.push([path, mime]);
      return { url: `/__akan_native/file/r${registered.length}`, mime, size: readFileSync(path).length };
    },
  } as unknown as DesktopContext;
  const plugin = createDesktopFilesystem(() => dirs);
  const m = plugin.methods as Record<string, (args: unknown, ctx: DesktopContext) => Promise<any>>;
  const call = (method: string, args?: unknown) => Promise.resolve().then(() => m[method]!(args, ctx));

  beforeEach(() => {
    for (const dir of [...Object.values(dirs), outside]) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    }
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test("capabilities scope (PL-11): globs on the written path, deny wins, symbolic links checked at their target", async () => {
    const scoped = (scope: unknown) => Object.create(ctx, { scope: { value: scope } }) as DesktopContext;
    const sctx = scoped({
      allow: [{ base: "data", path: "notes/**" }, { base: "cache" }],
      deny: [{ path: "notes/secret/**" }],
    });
    const run = (method: string, args: unknown, c = sctx) => Promise.resolve().then(() => m[method]!(args, c));
    const code = (p: Promise<unknown>) =>
      p.then(
        () => "ok",
        (e) => (e as { code?: string }).code,
      );
    expect(await code(run("writeFile", { base: "data", path: "notes/a.txt", data: "x", recursive: true }))).toBe("ok");
    expect(await code(run("readDir", { base: "data", path: "notes" }))).toBe("ok");
    expect(await code(run("writeFile", { base: "data", path: "other.txt", data: "x" }))).toBe("NOT_ALLOWED");
    expect(await code(run("writeFile", { base: "data", path: "notes/secret/k", data: "x", recursive: true }))).toBe(
      "NOT_ALLOWED",
    );
    expect(await code(run("readDir", { base: "data", path: "" }))).toBe("NOT_ALLOWED");
    expect(await code(run("writeFile", { base: "cache", path: "deep/x.bin", data: "x", recursive: true }))).toBe("ok");
    // rename checks both ends
    expect(await code(run("rename", { base: "data", from: "notes/a.txt", toBase: "documents", to: "a.txt" }))).toBe(
      "NOT_ALLOWED",
    );
    // A link inside the scope that points outside it: its real location is checked too.
    mkdirSync(join(dirs.data, "private"), { recursive: true });
    writeFileSync(join(dirs.data, "private", "p.txt"), "p");
    symlinkSync(join(dirs.data, "private"), join(dirs.data, "notes", "link"));
    expect(await code(run("readFile", { base: "data", path: "notes/link/p.txt", encoding: "utf8" }))).toBe(
      "NOT_ALLOWED",
    );
    // Without a scope the plugin's own rules apply as before.
    expect(await code(run("readFile", { base: "data", path: "notes/link/p.txt", encoding: "utf8" }, ctx))).toBe("ok");
  });

  // Architecture review 2026-09-26 (L4): recursive calls respect what is denied inside the folder,
  // listings leave out what the scope does not reach, allowed wildcards skip dot files, and a
  // case-insensitive volume compares folded paths.
  test("scopes reach what recursive calls and listings touch; dot files; case", async () => {
    const scoped = (scope: unknown) => Object.create(ctx, { scope: { value: scope } }) as DesktopContext;
    const sctx = scoped({
      allow: [
        { base: "data", path: "notes/**" },
        { base: "data", path: "n2/**" },
      ],
      deny: [{ path: "notes/secret/**" }],
    });
    const run = (method: string, args: unknown) => Promise.resolve().then(() => m[method]!(args, sctx));
    const code = (p: Promise<unknown>) =>
      p.then(
        () => "ok",
        (e) => (e as { code?: string }).code,
      );
    mkdirSync(join(dirs.data, "notes", "secret"), { recursive: true });
    writeFileSync(join(dirs.data, "notes", "a.txt"), "a");
    writeFileSync(join(dirs.data, "notes", ".draft"), "d");
    writeFileSync(join(dirs.data, "notes", "secret", "k"), "k");
    expect(
      (await run("readDir", { base: "data", path: "notes" })).entries.map((e: { name: string }) => e.name),
    ).toEqual(["a.txt"]);
    expect(await code(run("copy", { base: "data", from: "notes", to: "n2" }))).toBe("NOT_ALLOWED");
    expect(await code(run("rename", { base: "data", from: "notes", to: "n2" }))).toBe("NOT_ALLOWED");
    expect(await code(run("remove", { base: "data", path: "notes", recursive: true }))).toBe("NOT_ALLOWED");
    expect(existsSync(join(dirs.data, "notes", "secret", "k"))).toBe(true);
    expect(await code(run("readFile", { base: "data", path: "notes/.draft", encoding: "utf8" }))).toBe("NOT_ALLOWED");
    if (process.platform !== "linux") {
      // macOS and Windows volumes ignore case: "Secret" is the denied "secret".
      expect(await code(run("readFile", { base: "data", path: "notes/Secret/k", encoding: "utf8" }))).toBe(
        "NOT_ALLOWED",
      );
      expect(await code(run("writeFile", { base: "data", path: "NOTES/b.txt", data: "b" }))).toBe("ok");
    }
    rmSync(join(dirs.data, "notes", "secret"), { recursive: true });
    rmSync(join(dirs.data, "notes", ".draft"));
    expect(await code(run("copy", { base: "data", from: "notes", to: "n2" }))).toBe("ok");
  });

  test("base folders", () => {
    const mac = baseDirs(
      { app: ctx.app, appDataDir: "/Users/u/Library/Application Support/dev.test" },
      "darwin",
      {},
      "/Users/u",
      "/var/T",
    );
    expect(mac).toEqual({
      data: "/Users/u/Library/Application Support/dev.test/files",
      cache: "/Users/u/Library/Caches/dev.test/files",
      documents: "/Users/u/Documents",
      temp: "/var/T/dev.test/files",
    });
    expect(
      baseDirs({ app: ctx.app, appDataDir: "/a" }, "linux", { XDG_CACHE_HOME: "/xdg" }, "/home/u", "/tmp").cache,
    ).toBe("/xdg/dev.test/files");
  });

  test("text, base64 and FileRef round trips", async () => {
    await call("writeFile", { path: "notes.txt", base: "data", data: "﻿한글 ✓\n" });
    expect(readFileSync(join(dirs.data, "notes.txt"), "utf8")).toBe("﻿한글 ✓\n");
    expect(await call("readFile", { path: "notes.txt", base: "data", encoding: "utf8" })).toEqual({ data: "﻿한글 ✓\n" });
    await call("writeFile", { path: "bin", base: "cache", data: "AP8Q", encoding: "base64" });
    expect([...readFileSync(join(dirs.cache, "bin"))]).toEqual([0, 255, 16]);
    expect(await call("readFile", { path: "bin", base: "cache", encoding: "base64" })).toEqual({ data: "AP8Q" });
    const ref = await call("readFile", { path: "notes.txt", base: "data" });
    expect(ref).toEqual({ url: "/__akan_native/file/r1", mime: "text/plain", size: 14 });
    expect(registered.at(-1)).toEqual([join(dirs.data, "notes.txt"), "text/plain"]); // in place, no copy
    writeFileSync(join(dirs.data, "bad.txt"), new Uint8Array([0x61, 0xff, 0x62]));
    expect(await call("readFile", { path: "bad.txt", base: "data", encoding: "utf8" })).toEqual({ data: "a�b" });
  });

  test("append keeps call order; replace is atomic", async () => {
    const writes = Array.from({ length: 20 }, (_, i) =>
      call("writeFile", { path: "log.txt", base: "temp", data: `${i},`, append: true }),
    );
    await Promise.all(writes);
    expect(readFileSync(join(dirs.temp, "log.txt"), "utf8")).toBe(
      Array.from({ length: 20 }, (_, i) => `${i},`).join(""),
    );
    await call("writeFile", { path: "log.txt", base: "temp", data: "new" });
    expect(readFileSync(join(dirs.temp, "log.txt"), "utf8")).toBe("new");
    expect((await call("readDir", { path: "", base: "temp" })).entries.map((e: { name: string }) => e.name)).toEqual([
      "log.txt",
    ]); // no temp file left
  });

  test("parents: NOT_FOUND unless recursive", async () => {
    expect(await code(call("writeFile", { path: "a/b/c.txt", base: "data", data: "x" }))).toBe("NOT_FOUND");
    await call("writeFile", { path: "a/b/c.txt", base: "data", data: "x", recursive: true });
    expect(readFileSync(join(dirs.data, "a/b/c.txt"), "utf8")).toBe("x");
    expect(await code(call("writeFile", { path: "a/b/c.txt/d", base: "data", data: "x" }))).toBe("INVALID_ARGS"); // parent is a file
    expect(await code(call("writeFile", { path: "a/b", base: "data", data: "x" }))).toBe("INVALID_ARGS"); // is a folder
    expect(await code(call("readFile", { path: "a", base: "data", encoding: "utf8" }))).toBe("INVALID_ARGS");
    expect(await code(call("readFile", { path: "missing", base: "data" }))).toBe("NOT_FOUND");
  });

  test("readDir, stat, exists", async () => {
    await call("writeFile", { path: "b.txt", base: "documents", data: "12345" });
    await call("mkdir", { path: "a", base: "documents" });
    await call("writeFile", { path: "C.txt", base: "documents", data: "" });
    const { entries } = await call("readDir", { path: "", base: "documents" });
    expect(entries.map((e: { name: string; type: string; size: number }) => [e.name, e.type, e.size])).toEqual([
      ["C.txt", "file", 0],
      ["a", "directory", 0],
      ["b.txt", "file", 5],
    ]);
    expect(Math.abs(entries[2].mtime - Date.now())).toBeLessThan(60_000);
    expect(await call("stat", { path: "b.txt", base: "documents" })).toMatchObject({ type: "file", size: 5 });
    expect(await call("stat", { path: "", base: "documents" })).toMatchObject({ type: "directory", size: 0 });
    expect(await code(call("stat", { path: "nope", base: "documents" }))).toBe("NOT_FOUND");
    expect(await call("exists", { path: "a", base: "documents" })).toEqual({ value: true });
    expect(await call("exists", { path: "a/nope", base: "documents" })).toEqual({ value: false });
    expect(await call("exists", { path: "b.txt/nope", base: "documents" })).toEqual({ value: false });
    expect(await code(call("readDir", { path: "b.txt", base: "documents" }))).toBe("INVALID_ARGS");
    expect(await code(call("readDir", { path: "zz", base: "documents" }))).toBe("NOT_FOUND");
  });

  test("mkdir and remove", async () => {
    expect(await code(call("mkdir", { path: "x/y", base: "data" }))).toBe("NOT_FOUND");
    await call("mkdir", { path: "x/y", base: "data", recursive: true });
    await call("mkdir", { path: "x/y", base: "data", recursive: true }); // idempotent
    expect(await code(call("mkdir", { path: "x/y", base: "data" }))).toBe("INVALID_ARGS"); // exists
    expect(await code(call("mkdir", { path: "", base: "data" }))).toBe("INVALID_ARGS");
    await call("writeFile", { path: "x/y/f", base: "data", data: "1" });
    expect(await code(call("mkdir", { path: "x/y/f/g", base: "data", recursive: true }))).toBe("INVALID_ARGS");
    expect(await code(call("remove", { path: "x", base: "data" }))).toBe("INVALID_ARGS"); // not empty
    expect(await code(call("remove", { path: "", base: "data", recursive: true }))).toBe("INVALID_ARGS"); // never the base
    await call("remove", { path: "x/y/f", base: "data" });
    await call("remove", { path: "x/y", base: "data" }); // empty folder
    await call("writeFile", { path: "x/z/f", base: "data", data: "1", recursive: true });
    await call("remove", { path: "x", base: "data", recursive: true });
    expect(await call("exists", { path: "x", base: "data" })).toEqual({ value: false });
    expect(await code(call("remove", { path: "x", base: "data" }))).toBe("NOT_FOUND");
  });

  test("rename and copy, also across bases", async () => {
    await call("writeFile", { path: "d/one.txt", base: "data", data: "1", recursive: true });
    await call("copy", { from: "d", to: "d2", base: "data" });
    expect(readFileSync(join(dirs.data, "d2/one.txt"), "utf8")).toBe("1");
    await call("rename", { from: "d2", to: "moved", base: "data", toBase: "cache" });
    expect(readFileSync(join(dirs.cache, "moved/one.txt"), "utf8")).toBe("1");
    expect(await call("exists", { path: "d2", base: "data" })).toEqual({ value: false });
    // an existing file is replaced, an existing folder is not
    await call("writeFile", { path: "two.txt", base: "data", data: "2" });
    await call("copy", { from: "two.txt", to: "d/one.txt", base: "data" });
    expect(readFileSync(join(dirs.data, "d/one.txt"), "utf8")).toBe("2");
    expect(await code(call("rename", { from: "two.txt", to: "d", base: "data" }))).toBe("INVALID_ARGS");
    expect(await code(call("copy", { from: "d", to: "two.txt", base: "data" }))).toBe("INVALID_ARGS");
    expect(await code(call("rename", { from: "d", to: "d/inner", base: "data" }))).toBe("INVALID_ARGS");
    expect(await code(call("copy", { from: "two.txt", to: "two.txt", base: "data" }))).toBe("INVALID_ARGS");
    expect(await code(call("rename", { from: "nope", to: "x", base: "data" }))).toBe("NOT_FOUND");
    expect(await code(call("rename", { from: "two.txt", to: "no/where.txt", base: "data" }))).toBe("NOT_FOUND");
    await call("rename", { from: "two.txt", to: "three.txt", base: "data" });
    expect(readFileSync(join(dirs.data, "three.txt"), "utf8")).toBe("2");
  });

  test("case-only rename keeps the file (case-insensitive volumes)", async () => {
    await call("writeFile", { path: "case.txt", base: "data", data: "keep" });
    await call("rename", { from: "case.txt", to: "CASE.txt", base: "data" });
    const names = (await call("readDir", { path: "", base: "data" })).entries.map((e: { name: string }) => e.name);
    expect(names).toContain("CASE.txt");
    expect(readFileSync(join(dirs.data, "CASE.txt"), "utf8")).toBe("keep");
  });

  test("symbolic links cannot leave the base", async () => {
    writeFileSync(join(outside, "secret.txt"), "secret");
    symlinkSync(outside, join(dirs.data, "out"));
    symlinkSync(join(outside, "secret.txt"), join(dirs.data, "secret-link"));
    symlinkSync(join(outside, "nothing-yet"), join(dirs.data, "dangling"));
    mkdirSync(join(dirs.data, "in"));
    writeFileSync(join(dirs.data, "in", "ok.txt"), "ok");
    symlinkSync(join(dirs.data, "in"), join(dirs.data, "inside-link"));

    expect(await code(call("readFile", { path: "out/secret.txt", base: "data", encoding: "utf8" }))).toBe(
      "PERMISSION_DENIED",
    );
    expect(await code(call("readFile", { path: "secret-link", base: "data", encoding: "utf8" }))).toBe(
      "PERMISSION_DENIED",
    );
    expect(await code(call("writeFile", { path: "out/new.txt", base: "data", data: "x" }))).toBe("PERMISSION_DENIED");
    expect(await code(call("writeFile", { path: "dangling", base: "data", data: "x" }))).toBe("PERMISSION_DENIED");
    expect(await code(call("readDir", { path: "out", base: "data" }))).toBe("PERMISSION_DENIED");
    expect(await code(call("exists", { path: "out/secret.txt", base: "data" }))).toBe("PERMISSION_DENIED");
    expect(await code(call("copy", { from: "secret-link", to: "stolen", base: "data" }))).toBe("PERMISSION_DENIED");
    expect(await code(call("mkdir", { path: "out/sub", base: "data", recursive: true }))).toBe("PERMISSION_DENIED");
    // links inside the base work, and readDir reports links as such
    expect(await call("readFile", { path: "inside-link/ok.txt", base: "data", encoding: "utf8" })).toEqual({
      data: "ok",
    });
    const types = Object.fromEntries(
      (await call("readDir", { path: "", base: "data" })).entries.map((e: { name: string; type: string }) => [
        e.name,
        e.type,
      ]),
    );
    expect(types).toMatchObject({ out: "symlink", "secret-link": "symlink", in: "directory" });
    // remove deletes the link, not what it points to
    await call("remove", { path: "out", base: "data" });
    await call("remove", { path: "secret-link", base: "data" });
    expect(readFileSync(join(outside, "secret.txt"), "utf8")).toBe("secret");
    // rename moves a link itself
    await call("rename", { from: "inside-link", to: "renamed-link", base: "data" });
    expect(await call("readFile", { path: "renamed-link/ok.txt", base: "data", encoding: "utf8" })).toEqual({
      data: "ok",
    });
  });

  test("argument errors", async () => {
    expect(await code(call("readFile", { path: "../x", base: "data" }))).toBe("INVALID_ARGS");
    expect(await code(call("readFile", { path: "/etc/hosts", base: "data" }))).toBe("INVALID_ARGS");
    expect(await code(call("readFile", { path: "x", base: "home" }))).toBe("INVALID_ARGS");
    expect(await code(call("readFile", undefined))).toBe("INVALID_ARGS");
    expect(await code(call("writeFile", { path: "x", base: "data", url: "/__akan_native/file/a" }))).toBe(
      "INVALID_ARGS",
    );
    expect(await code(call("writeFile", { path: "x", base: "data", data: "x", append: "yes" }))).toBe("INVALID_ARGS");
    expect(await code(call("rename", { from: "a", to: "b", base: "data", toBase: "nope" }))).toBe("INVALID_ARGS");
    expect(await call("paths")).toEqual(dirs);
  });
});

// ---------------------------------------------------------------- web (OPFS) against an in-memory fake

class FakeDOMException extends Error {
  constructor(
    message: string,
    override readonly name: string,
  ) {
    super(message);
  }
}

class FakeFile {
  readonly kind = "file";
  bytes = new Uint8Array(0);
  mtime = Date.now();
  constructor(readonly name: string) {}
  async getFile() {
    return new File([this.bytes], this.name, { lastModified: this.mtime });
  }
  async createWritable({ keepExistingData = false } = {}) {
    let buffer = keepExistingData ? this.bytes.slice() : new Uint8Array(0);
    let position = 0;
    const put = (chunk: Uint8Array) => {
      const next = new Uint8Array(Math.max(buffer.length, position + chunk.length));
      next.set(buffer);
      next.set(chunk, position);
      buffer = next;
      position += chunk.length;
    };
    const commit = () => {
      this.bytes = buffer;
      this.mtime = Date.now();
    };
    const stream = new WritableStream<Uint8Array>({ write: (chunk) => put(chunk), close: commit });
    const toBytes = async (data: unknown) =>
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : data instanceof Blob
          ? new Uint8Array(await data.arrayBuffer())
          : new Uint8Array(data as ArrayBuffer);
    return Object.assign(stream, {
      write: async (data: unknown) => put(await toBytes(data)),
      seek: async (at: number) => {
        position = at;
      },
      close: async () => commit(),
      abort: async () => {},
    });
  }
}

class FakeDir {
  readonly kind = "directory";
  children = new Map<string, FakeDir | FakeFile>();
  constructor(readonly name: string) {}
  async getFileHandle(name: string, { create = false } = {}) {
    const child = this.children.get(name);
    if (child instanceof FakeDir) throw new FakeDOMException("is a directory", "TypeMismatchError");
    if (child) return child;
    if (!create) throw new FakeDOMException(`${name} not found`, "NotFoundError");
    const file = new FakeFile(name);
    this.children.set(name, file);
    return file;
  }
  async getDirectoryHandle(name: string, { create = false } = {}) {
    const child = this.children.get(name);
    if (child instanceof FakeFile) throw new FakeDOMException("is a file", "TypeMismatchError");
    if (child) return child;
    if (!create) throw new FakeDOMException(`${name} not found`, "NotFoundError");
    const dir = new FakeDir(name);
    this.children.set(name, dir);
    return dir;
  }
  async removeEntry(name: string, { recursive = false } = {}) {
    const child = this.children.get(name);
    if (!child) throw new FakeDOMException(`${name} not found`, "NotFoundError");
    if (child instanceof FakeDir && child.children.size > 0 && !recursive)
      throw new FakeDOMException("not empty", "InvalidModificationError");
    this.children.delete(name);
  }
  async *entries() {
    yield* [...this.children.entries()];
  }
}

describe("web (OPFS)", () => {
  let opfs: FakeDir;
  beforeEach(() => {
    opfs = new FakeDir("");
    Object.defineProperty(navigator, "storage", {
      value: { getDirectory: async () => opfs },
      configurable: true,
      writable: true,
    });
    host = installMockHost({ platform: "web" });
  });
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).storage;
  });

  test("round trips in every base", async () => {
    for (const base of ["data", "cache", "documents", "temp"] as const) {
      await filesystem.writeFile({ path: "dir/a.txt", base, data: "héllo", recursive: true });
      expect(await filesystem.readFile({ path: "dir/a.txt", base, encoding: "utf8" })).toEqual({ data: "héllo" });
      expect(await filesystem.readFile({ path: "dir/a.txt", base, encoding: "base64" })).toEqual({ data: "aMOpbGxv" });
    }
    expect([...opfs.children.keys()].sort()).toEqual(["cache", "data", "documents", "temp"]);
    const ref = await filesystem.readFile({ path: "dir/a.txt", base: "data" });
    expect(ref).toMatchObject({ mime: "text/plain", size: 6 });
    expect(await (await fetch(ref.url)).text()).toBe("héllo");
    expect(await filesystem.paths()).toEqual({
      data: "opfs:/data",
      cache: "opfs:/cache",
      documents: "opfs:/documents",
      temp: "opfs:/temp",
    });
  });

  test("append, base64 and url sources", async () => {
    await Promise.all(
      [1, 2, 3].map((i) => filesystem.writeFile({ path: "log", base: "data", data: `${i}`, append: true })),
    );
    expect(await filesystem.readFile({ path: "log", base: "data", encoding: "utf8" })).toEqual({ data: "123" });
    await filesystem.writeFile({ path: "b", base: "data", data: "AP8=", encoding: "base64" });
    expect(await filesystem.readFile({ path: "b", base: "data", encoding: "base64" })).toEqual({ data: "AP8=" });
    const url = URL.createObjectURL(new Blob(["from a blob"]));
    await filesystem.writeFile({ path: "c", base: "data", url });
    URL.revokeObjectURL(url);
    expect(await filesystem.readFile({ path: "c", base: "data", encoding: "utf8" })).toEqual({ data: "from a blob" });
  });

  test("the same error codes as the native hosts", async () => {
    expect(await code(filesystem.writeFile({ path: "a/b.txt", base: "data", data: "x" }))).toBe("NOT_FOUND");
    expect(await code(filesystem.readFile({ path: "nope", base: "data" }))).toBe("NOT_FOUND");
    await filesystem.mkdir({ path: "a", base: "data" });
    expect(await code(filesystem.mkdir({ path: "a", base: "data" }))).toBe("INVALID_ARGS");
    await filesystem.mkdir({ path: "a", base: "data", recursive: true });
    expect(await code(filesystem.writeFile({ path: "a", base: "data", data: "x" }))).toBe("INVALID_ARGS");
    expect(await code(filesystem.readFile({ path: "../x", base: "data" }))).toBe("INVALID_ARGS");
    await filesystem.writeFile({ path: "a/f", base: "data", data: "1" });
    expect(await code(filesystem.remove({ path: "a", base: "data" }))).toBe("INVALID_ARGS");
    expect(await code(filesystem.readDir({ path: "a/f", base: "data" }))).toBe("INVALID_ARGS");
    expect(await filesystem.exists({ path: "a/f/g", base: "data" })).toEqual({ value: false });
  });

  test("readDir, stat, rename, copy, remove", async () => {
    await filesystem.writeFile({ path: "d/one", base: "data", data: "1", recursive: true });
    await filesystem.writeFile({ path: "d/two", base: "data", data: "22" });
    await filesystem.mkdir({ path: "d/sub", base: "data" });
    const { entries } = await filesystem.readDir({ path: "d", base: "data" });
    expect(entries.map((e) => [e.name, e.type, e.size])).toEqual([
      ["one", "file", 1],
      ["sub", "directory", 0],
      ["two", "file", 2],
    ]);
    expect(await filesystem.stat({ path: "d/two", base: "data" })).toMatchObject({ type: "file", size: 2 });
    await filesystem.copy({ from: "d", to: "d-copy", base: "data", toBase: "documents" });
    expect(await filesystem.readFile({ path: "d-copy/two", base: "documents", encoding: "utf8" })).toEqual({
      data: "22",
    });
    await filesystem.rename({ from: "d", to: "e", base: "data" });
    expect(await filesystem.exists({ path: "d", base: "data" })).toEqual({ value: false });
    expect(await filesystem.readFile({ path: "e/one", base: "data", encoding: "utf8" })).toEqual({ data: "1" });
    expect(await code(filesystem.rename({ from: "e", to: "e/x", base: "data" }))).toBe("INVALID_ARGS");
    expect(await code(filesystem.rename({ from: "e/one", to: "e/sub", base: "data" }))).toBe("INVALID_ARGS");
    await filesystem.rename({ from: "e/one", to: "e/two", base: "data" });
    expect(await filesystem.readFile({ path: "e/two", base: "data", encoding: "utf8" })).toEqual({ data: "1" });
    await filesystem.remove({ path: "e", base: "data", recursive: true });
    expect((await filesystem.readDir({ path: "", base: "data" })).entries).toEqual([]);
  });

  test("UNSUPPORTED without OPFS", async () => {
    delete (navigator as unknown as Record<string, unknown>).storage;
    expect(await code(filesystem.readDir({ path: "", base: "data" }))).toBe("UNSUPPORTED");
    expect(
      isAkanNativeError(await rejection(filesystem.readFile({ path: "../x", base: "data" })), "INVALID_ARGS"),
    ).toBe(true); // checked first
  });
});
