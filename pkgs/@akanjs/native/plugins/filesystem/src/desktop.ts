// Desktop: node:fs from the Bun Worker. Bases follow Tauri's app directories
// (tauri/crates/tauri/src/path/desktop.rs: app_data_dir, app_cache_dir, document_dir) and
// Electrobun's Utils.paths (electrobun/package/src/sdks/main/core/Utils.ts:649-708), with a "files"
// folder of their own inside the app folders: ~/Library/Application Support/<id> also holds other
// plugins' state (preferences.json, device-id) and ~/Library/Caches/<id> holds WKWebView's cache.
//
// Symbolic links: a path is resolved with realpath and must stay inside the (resolved) base, the
// check tauri-plugins-workspace/plugins/fs/src/commands.rs:1606-1640 (is_forbidden) makes after
// following links. A dangling link is refused too, since creating a file through it would write
// wherever it points.
import { randomBytes } from "node:crypto";
import type { Stats } from "node:fs";
import {
  appendFile,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { AkanNativeError, type FileRef, scopePermits } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import {
  BASES,
  base64ToBytes,
  bytesToBase64,
  checkBase,
  checkEncoding,
  checkFlag,
  checkObject,
  checkPath,
  checkScope,
  checkWriteSource,
  decodeUtf8,
  encodeUtf8,
  invalid,
  mimeFor,
  serialQueue,
  sortEntries,
} from "./common.ts";
import type { BaseDirectory, DirEntry, EntryType, FileInfo, FilesystemApi } from "./index.ts";

type Dirs = Record<BaseDirectory, string>;

/** The base folders for an app. Windows and Linux are unverified until those milestones. */
export function baseDirs(
  ctx: Pick<DesktopContext, "app" | "appDataDir">,
  platform = process.platform,
  env = process.env,
  home = homedir(),
  tmp = tmpdir(),
): Dirs {
  const id = ctx.app.id;
  const cacheRoot =
    platform === "darwin"
      ? join(home, "Library", "Caches")
      : platform === "win32"
        ? env.LOCALAPPDATA || join(home, "AppData", "Local")
        : env.XDG_CACHE_HOME?.startsWith("/")
          ? env.XDG_CACHE_HOME
          : join(home, ".cache");
  return {
    data: join(ctx.appDataDir, "files"),
    cache: join(cacheRoot, id, "files"),
    documents: platform === "win32" ? join(env.USERPROFILE || home, "Documents") : join(home, "Documents"),
    temp: join(tmp, id, "files"),
  };
}

const CODES: Record<string, AkanNativeError["code"]> = {
  ENOENT: "NOT_FOUND",
  EEXIST: "INVALID_ARGS",
  ENOTEMPTY: "INVALID_ARGS",
  EISDIR: "INVALID_ARGS",
  ENOTDIR: "INVALID_ARGS",
  EINVAL: "INVALID_ARGS",
  ENAMETOOLONG: "INVALID_ARGS",
  ELOOP: "INVALID_ARGS",
  EACCES: "PERMISSION_DENIED",
  EPERM: "PERMISSION_DENIED",
  EROFS: "PERMISSION_DENIED",
};

function mapError(error: unknown, base?: BaseDirectory): AkanNativeError {
  if (error instanceof AkanNativeError) return error;
  const code = (error as NodeJS.ErrnoException)?.code ?? "";
  const message = String((error as Error)?.message ?? error);
  if ((code === "EPERM" || code === "EACCES") && base === "documents" && process.platform === "darwin") {
    return new AkanNativeError(
      "PERMISSION_DENIED",
      `${message} (allow the app in System Settings > Privacy & Security > Files and Folders)`,
    );
  }
  return new AkanNativeError(CODES[code] ?? "INTERNAL", message);
}

const errno = (error: unknown) => (error as NodeJS.ErrnoException)?.code;

function typeOf(st: Stats): EntryType {
  if (st.isSymbolicLink()) return "symlink";
  if (st.isFile()) return "file";
  if (st.isDirectory()) return "directory";
  return "other";
}

const infoOf = (st: Stats): FileInfo => ({
  type: typeOf(st),
  size: st.isFile() ? st.size : 0,
  mtime: Math.round(st.mtimeMs),
});

async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (errno(error) === "ENOENT" || errno(error) === "ENOTDIR") return null;
    throw error;
  }
}

/** Whether the volume of `dir` ignores case: the same folder answers under the other case of its name. */
async function caseInsensitive(dir: string): Promise<boolean> {
  const name = basename(dir);
  const flipped = name === name.toUpperCase() ? name.toLowerCase() : name.toUpperCase();
  if (flipped === name) return process.platform !== "linux"; // no letters to flip
  const [a, b] = await Promise.all([lstatOrNull(dir), lstatOrNull(join(dirname(dir), flipped))]);
  if (!a || !b) return false;
  return a.ino === 0 ? process.platform !== "linux" : a.ino === b.ino && a.dev === b.dev;
}

export function createDesktopFilesystem(dirsFor: (ctx: DesktopContext) => Dirs = baseDirs) {
  const queue = serialQueue();
  let dirs: Dirs | null = null;
  const roots = new Map<BaseDirectory, string>();
  const folding = new Map<BaseDirectory, boolean>();

  /** The resolved base folder, created on first use. */
  async function root(ctx: DesktopContext, base: BaseDirectory): Promise<string> {
    dirs ??= dirsFor(ctx);
    let real = roots.get(base);
    if (!real) {
      await mkdir(dirs[base], { recursive: true });
      real = await realpath(dirs[base]);
      roots.set(base, real);
      folding.set(base, await caseInsensitive(real));
    }
    return real;
  }

  /**
   * Whether the base's volume ignores case (macOS and Windows by default; not Linux): then scopes
   * compare folded paths, so a deny of "secret/**" also keeps "Secret/…" out.
   */
  const fold = (base: BaseDirectory) => folding.get(base) ?? false;

  /**
   * The call's scope, on the spelled path (before anything is resolved). Before the base's volume
   * is known, the safe reading of both: allow compared exactly, deny folded.
   */
  const scoped = (ctx: DesktopContext, base: BaseDirectory, segments: string[]) => {
    if (folding.has(base)) return checkScope(ctx.scope, base, segments, fold(base));
    checkScope(ctx.scope, base, segments, false);
    checkScope(ctx.scope, base, segments, true);
  };

  /**
   * With a scope, what a recursive call reaches under a folder must be inside it as well: a copy or
   * move of "notes" must not carry a denied "notes/secret" along, nor remove it. `to`: where the
   * entries end up (copy, rename).
   */
  async function checkTree(
    ctx: DesktopContext,
    base: BaseDirectory,
    segments: string[],
    dir: string,
    to?: { base: BaseDirectory; segments: string[] },
  ): Promise<void> {
    if (!ctx.scope) return;
    for (const rel of await readdir(dir, { recursive: true })) {
      const parts = String(rel).split(sep).filter(Boolean);
      checkScope(ctx.scope, base, [...segments, ...parts], fold(base));
      if (to) checkScope(ctx.scope, to.base, [...to.segments, ...parts], fold(to.base));
    }
  }

  const inside = (rootPath: string, path: string) => path === rootPath || path.startsWith(rootPath + sep);
  const escaped = (path: string) =>
    new AkanNativeError("PERMISSION_DENIED", `${path} leads outside its base directory through a symbolic link`);

  /**
   * The real location of `segments` in `base`. With `follow` the last segment is resolved too (read,
   * write), without it only its folder (remove or rename a link itself). `exists` tells whether the
   * whole path exists.
   */
  async function resolve(
    ctx: DesktopContext,
    base: BaseDirectory,
    segments: string[],
    follow: boolean,
  ): Promise<{ path: string; exists: boolean }> {
    const rootPath = await root(ctx, base);
    const shown = segments.join("/") || ".";
    const last = follow ? null : segments.at(-1);
    let current = join(rootPath, ...(follow ? segments : segments.slice(0, -1)));
    const rest: string[] = [];
    for (;;) {
      let real: string | null = null;
      try {
        real = await realpath(current);
      } catch (error) {
        if (errno(error) !== "ENOENT" && errno(error) !== "ENOTDIR") throw error;
        if (await lstatOrNull(current)) throw escaped(shown); // a dangling symbolic link
      }
      if (real !== null) {
        if (!inside(rootPath, real)) throw escaped(shown);
        const path = join(real, ...rest.reverse(), ...(last ? [last] : []));
        const exists = rest.length === 0 && (last ? (await lstatOrNull(path)) !== null : true);
        // PL-11: through a symbolic link the scope applies to the real location as well; the plugin
        // then uses exactly this path. (A name that differs only in case was checked folded.)
        if (ctx.scope) {
          const actual = relative(rootPath, path).split(sep).filter(Boolean);
          if (actual.join("/") !== segments.join("/")) checkScope(ctx.scope, base, actual, fold(base));
        }
        return { path, exists };
      }
      rest.push(basename(current));
      current = dirname(current);
    }
  }

  const run = <T>(base: BaseDirectory, task: () => Promise<T>) =>
    queue(task).catch((error: unknown) => {
      throw mapError(error, base);
    });

  async function requireParent(
    ctx: DesktopContext,
    base: BaseDirectory,
    segments: string[],
    shown: string,
  ): Promise<void> {
    const parent = await resolve(ctx, base, segments.slice(0, -1), true);
    if (!parent.exists) throw new AkanNativeError("NOT_FOUND", `the folder of ${shown} does not exist`);
    if (!(await stat(parent.path)).isDirectory()) throw invalid(`the parent of ${shown} is not a folder`);
  }

  async function move(args: unknown, ctx: DesktopContext, keepSource: boolean): Promise<void> {
    const o = checkObject(args);
    const base = checkBase(o.base);
    const toBase = o.toBase === undefined || o.toBase === null ? base : checkBase(o.toBase, "toBase");
    const from = checkPath(o.from, false, "from");
    const to = checkPath(o.to, false, "to");
    scoped(ctx, base, from);
    scoped(ctx, toBase, to);
    return run(base, async () => {
      // rename moves a link itself, copy copies what it points to
      const src = await resolve(ctx, base, from, keepSource);
      if (!src.exists) throw new AkanNativeError("NOT_FOUND", `${o.from} does not exist`);
      const srcStat = keepSource ? await stat(src.path) : await lstat(src.path);
      await requireParent(ctx, toBase, to, String(o.to));
      const dst = await resolve(ctx, toBase, to, false);
      if (dst.path === src.path) throw invalid("from and to are the same path");
      if (dst.path.startsWith(src.path + sep)) throw invalid("cannot move or copy a folder into itself");
      if (srcStat.isDirectory()) await checkTree(ctx, base, from, src.path, { base: toBase, segments: to });
      const dstStat = await lstatOrNull(dst.path);
      if (dstStat) {
        const same = dstStat.ino === srcStat.ino && dstStat.dev === srcStat.dev;
        if (same && keepSource) throw invalid("from and to are the same file");
        if (!same) {
          if (dstStat.isDirectory()) throw invalid(`${o.to} already exists and is a folder`);
          if (srcStat.isDirectory()) throw invalid(`${o.to} already exists and is a file`);
        }
        // same && !keepSource: a case-only rename on a case-insensitive volume; rename handles it
      }
      if (keepSource) {
        await cp(src.path, dst.path, { recursive: true, force: true, errorOnExist: false, verbatimSymlinks: true });
        return;
      }
      try {
        await rename(src.path, dst.path);
      } catch (error) {
        if (errno(error) !== "EXDEV") throw error;
        // Different volumes (e.g. temp on another disk): copy, then remove the source.
        await cp(src.path, dst.path, { recursive: true, force: true, errorOnExist: false, verbatimSymlinks: true });
        await rm(src.path, { recursive: true, force: true });
      }
    });
  }

  return defineDesktopPlugin<FilesystemApi>({
    id: "filesystem",
    methods: {
      readFile(args: unknown, ctx: DesktopContext): Promise<{ data: string } | FileRef> {
        const o = checkObject(args);
        const base = checkBase(o.base);
        const segments = checkPath(o.path, false);
        scoped(ctx, base, segments);
        const encoding = checkEncoding(o.encoding, true);
        return run(base, async () => {
          const target = await resolve(ctx, base, segments, true);
          if (!target.exists) throw new AkanNativeError("NOT_FOUND", `${o.path} does not exist`);
          if (!(await stat(target.path)).isFile()) throw invalid(`${o.path} is not a file`);
          // Without an encoding the file stays on disk and the native shell serves it (PL-7).
          if (encoding === undefined) return ctx.registerFile(target.path, mimeFor(basename(target.path)));
          const bytes = await readFile(target.path);
          return { data: encoding === "utf8" ? decodeUtf8(bytes) : bytesToBase64(bytes) };
        });
      },

      writeFile(args, ctx) {
        const o = checkObject(args);
        const base = checkBase(o.base);
        const segments = checkPath(o.path, false);
        scoped(ctx, base, segments);
        const source = checkWriteSource(o);
        const append = checkFlag(o.append, "append");
        const recursive = checkFlag(o.recursive, "recursive");
        if (source.kind === "url")
          throw invalid("url is resolved by the page on desktop; pass data (the JS API does this)");
        const bytes = source.encoding === "base64" ? base64ToBytes(source.data) : encodeUtf8(source.data);
        return run(base, async () => {
          if (recursive) {
            const parent = await resolve(ctx, base, segments.slice(0, -1), true);
            if (!parent.exists) await mkdir(parent.path, { recursive: true });
          }
          await requireParent(ctx, base, segments, String(o.path));
          const target = await resolve(ctx, base, segments, true);
          if (target.exists && !(await stat(target.path)).isFile()) throw invalid(`${o.path} is not a file`);
          if (append) return appendFile(target.path, bytes);
          // Write-then-rename: a crash never leaves a half-written file (as preferences does).
          const tmp = join(dirname(target.path), `.${basename(target.path)}.${randomBytes(6).toString("hex")}.tmp`);
          try {
            await writeFile(tmp, bytes);
            await rename(tmp, target.path);
          } catch (error) {
            await rm(tmp, { force: true }).catch(() => {});
            throw error;
          }
        });
      },

      readDir(args, ctx) {
        const o = checkObject(args);
        const base = checkBase(o.base);
        const segments = checkPath(o.path, true);
        scoped(ctx, base, segments);
        return run(base, async () => {
          const dir = await resolve(ctx, base, segments, true);
          if (!dir.exists) throw new AkanNativeError("NOT_FOUND", `${o.path || "."} does not exist`);
          if (!(await stat(dir.path)).isDirectory()) throw invalid(`${o.path} is not a folder`);
          const names = await readdir(dir.path);
          const entries: DirEntry[] = [];
          for (const name of names) {
            // Entries outside the scope are not listed (a dot file under an allowed "notes/**", a denied folder).
            if (
              ctx.scope &&
              !scopePermits(ctx.scope, { base, path: [...segments, name].join("/") }, ["path"], [], fold(base))
            )
              continue;
            const st = await lstatOrNull(join(dir.path, name));
            if (st) entries.push({ name, ...infoOf(st) });
          }
          return { entries: sortEntries(entries) };
        });
      },

      stat(args, ctx) {
        const o = checkObject(args);
        const base = checkBase(o.base);
        const segments = checkPath(o.path, true);
        scoped(ctx, base, segments);
        return run(base, async () => {
          const target = await resolve(ctx, base, segments, true);
          if (!target.exists) throw new AkanNativeError("NOT_FOUND", `${o.path} does not exist`);
          return infoOf(await stat(target.path));
        });
      },

      exists(args, ctx) {
        const o = checkObject(args);
        const base = checkBase(o.base);
        const segments = checkPath(o.path, true);
        scoped(ctx, base, segments);
        return run(base, async () => ({ value: (await resolve(ctx, base, segments, true)).exists }));
      },

      mkdir(args, ctx) {
        const o = checkObject(args);
        const base = checkBase(o.base);
        const segments = checkPath(o.path, true);
        scoped(ctx, base, segments);
        const recursive = checkFlag(o.recursive, "recursive");
        return run(base, async () => {
          const target = await resolve(ctx, base, segments, true);
          if (target.exists) {
            if (recursive && (await stat(target.path)).isDirectory()) return;
            throw invalid(`${o.path || "the base folder"} already exists`);
          }
          if (!recursive) await requireParent(ctx, base, segments, String(o.path));
          await mkdir(target.path, { recursive });
        });
      },

      remove(args, ctx) {
        const o = checkObject(args);
        const base = checkBase(o.base);
        const segments = checkPath(o.path, false);
        scoped(ctx, base, segments);
        const recursive = checkFlag(o.recursive, "recursive");
        return run(base, async () => {
          const target = await resolve(ctx, base, segments, false);
          const st = await lstatOrNull(target.path);
          if (!st) throw new AkanNativeError("NOT_FOUND", `${o.path} does not exist`);
          if (!st.isDirectory()) return rm(target.path);
          if (recursive) {
            await checkTree(ctx, base, segments, target.path);
            return rm(target.path, { recursive: true });
          }
          try {
            await rmdir(target.path);
          } catch (error) {
            if (errno(error) === "ENOTEMPTY" || errno(error) === "EEXIST")
              throw invalid(`${o.path} is not empty (pass recursive: true)`);
            throw error;
          }
        });
      },

      rename: (args, ctx) => move(args, ctx, false),
      copy: (args, ctx) => move(args, ctx, true),

      paths(_args, ctx) {
        dirs ??= dirsFor(ctx);
        return Object.fromEntries(BASES.map((base) => [base, dirs![base]])) as Dirs;
      },
    },
  });
}

export default createDesktopFilesystem();
