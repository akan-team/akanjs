// Desktop: the OS's file dialogs on the calling window, from the shell (shell ops `panel.open`,
// `panel.save`, `panel.mime`; plugins.md Q-P6): NSOpenPanel / NSSavePanel sheets on macOS
// (native/desktop/src/panels.rs), IFileOpenDialog / IFileSaveDialog on Windows (win/dialogs.rs),
// GtkFileChooserNative on Linux (linux/dialogs.rs, the XDG portal where GTK uses it). The shell
// shows the dialog and answers with the chosen paths; this plugin host (same process) copies them.
//
// - Types: MIME types and extensions become the OS's filter (UTTypes, extension patterns, GTK MIME
//   filters). A type the OS does not know turns the filter off, so a file is never unpickable.
// - macOS: the panel grants this process what the user picked (and where they chose to save), even
//   in TCC-protected folders such as ~/Documents, so the copies are made here. Copies on the same
//   APFS volume are clones. The app is not sandboxed: no security-scoped bookmarks are needed.
// - Picked files are served as FileRefs of the copies; no path reaches the page. MIME types come
//   from the OS (one `panel.mime` call per result), else the built-in table.
// - forServer copies nothing: the FileRefs serve the originals, and each result carries a grant the
//   app's server exchanges for the path (packages/desktop/src/grants.ts). A saveFile grant names where
//   the user chose to save, and the server writes the file.
// - One panel at a time (a second call rejects CANCELLED, as on the other platforms).
import { randomBytes } from "node:crypto";
import { constants, copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { AkanNativeError, mimeFor } from "../../../packages/core/src/index.ts";
import { grantFile } from "../../../packages/desktop/src/grants.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import { base64ToBytes, checkFlag, checkLimit, checkName, checkObject, checkSaveSource, checkTypes } from "./common.ts";
import type { DirectoryFile, FilePickerApi, PickedFile } from "./index.ts";

type OpenAnswer = { cancelled: true } | { paths: string[] };
type SaveAnswer = { cancelled: true } | { path: string };

interface Staged {
  path: string;
  name: string;
  mime: string;
  size: number;
  relative?: string;
}

//? A dev build without a server of its own serves `akan start`'s pages, and that server checks a signed dev grant. One
//? that carries a server asks it over IPC, like a release build: the carried server runs in edge mode and refuses a
//? dev grant.
const devGrant = (ctx: DesktopContext) => ctx.dev && !ctx.server;

/** Regular files under `dir`, depth first by name, without hidden files and folders (".*"). */
export function listFiles(dir: string, limit: number): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  const walk = (rel: string): boolean => {
    const entries = readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (walk(path)) return true;
      } else if (entry.isFile()) {
        if (files.length === limit) return true;
        files.push(path);
      }
    }
    return false;
  };
  const truncated = walk("");
  return { files, truncated };
}

export function createDesktopFilePicker() {
  let root: string | null = null;
  let busy = false;

  /** A fresh folder for this call's copies, under $TMPDIR/<app id>/file-picker (emptied at launch). */
  function stageDir(ctx: DesktopContext): string {
    root ??= join(tmpdir(), ctx.app.id, "file-picker");
    const dir = join(root, randomBytes(6).toString("hex"));
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** One panel at a time, like the other platforms. */
  async function exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (busy) throw new AkanNativeError("CANCELLED", "a file dialog is already open");
    busy = true;
    try {
      return await run();
    } finally {
      busy = false;
    }
  }

  /** The OS's MIME types for the files' extensions; the built-in table for the rest. */
  async function mimes(ctx: DesktopContext, paths: string[]): Promise<(path: string) => string> {
    const exts = [...new Set(paths.map((p) => extname(p).slice(1).toLowerCase()).filter(Boolean))];
    const known = exts.length
      ? ((await ctx.shell("panel.mime", { exts }).catch(() => ({}))) as Record<string, string>)
      : {};
    return (path) => known[extname(path).slice(1).toLowerCase()] ?? mimeFor(basename(path));
  }

  function stage(dir: string, src: string, seq: number, mime: string): Staged {
    const ext = extname(src)
      .slice(1)
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 8);
    const dst = join(dir, `${seq}${ext ? `.${ext}` : ""}`);
    try {
      copyFileSync(src, dst, constants.COPYFILE_FICLONE);
    } catch (error) {
      throw new AkanNativeError("INTERNAL", `could not copy ${basename(src)}: ${(error as Error).message}`);
    }
    return { path: dst, name: basename(src), mime, size: statSync(dst).size };
  }

  const toPicked = (ctx: DesktopContext, file: Staged): PickedFile => ({
    ...ctx.registerFile(file.path, file.mime),
    name: file.name,
  });

  return defineDesktopPlugin<FilePickerApi>({
    id: "file-picker",
    setup(ctx) {
      root = join(tmpdir(), ctx.app.id, "file-picker");
      // Copies of an earlier session are no longer reachable (their FileRefs are gone).
      rmSync(root, { recursive: true, force: true });
    },
    methods: {
      async pickFiles(options, ctx) {
        const o = checkObject(options, true);
        const types = checkTypes(o.types);
        const multiple = checkFlag(o.multiple, "multiple");
        const forServer = checkFlag(o.forServer, "forServer");
        return exclusive(async () => {
          const answer = (await ctx.shell("panel.open", { types, multiple })) as OpenAnswer;
          if ("cancelled" in answer) return { files: [] };
          const mime = await mimes(ctx, answer.paths);
          if (forServer)
            return {
              files: answer.paths.map((p) => ({
                ...ctx.registerFile(p, mime(p)),
                name: basename(p),
                grant: grantFile(p, "read", { dev: devGrant(ctx) }),
              })),
            };
          const dir = stageDir(ctx);
          return { files: answer.paths.map((p, i) => toPicked(ctx, stage(dir, p, i, mime(p)))) };
        });
      },

      async saveFile(options, ctx) {
        const o = checkObject(options, false);
        const name = checkName(o.name);
        if (checkFlag(o.forServer, "forServer")) {
          if (o.data !== undefined || o.url !== undefined)
            throw new AkanNativeError("INVALID_ARGS", "forServer saves nothing itself; the server writes the file");
          return exclusive(async () => {
            const answer = (await ctx.shell("panel.save", { name })) as SaveAnswer;
            if ("cancelled" in answer) return { saved: false };
            return {
              saved: true,
              name: basename(answer.path),
              grant: grantFile(answer.path, "write", { dev: devGrant(ctx) }),
            };
          });
        }
        const source = checkSaveSource(o);
        if (source.kind === "url")
          throw new AkanNativeError(
            "INVALID_ARGS",
            "url is resolved by the page on desktop; pass data (the JS API does this)",
          );
        return exclusive(async () => {
          const answer = (await ctx.shell("panel.save", { name })) as SaveAnswer;
          if ("cancelled" in answer) return { saved: false };
          // The panel already asked whether to replace an existing file.
          try {
            writeFileSync(answer.path, source.encoding === "base64" ? base64ToBytes(source.data) : source.data);
          } catch (error) {
            throw new AkanNativeError(
              "INTERNAL",
              `could not save ${basename(answer.path)}: ${(error as Error).message}`,
            );
          }
          return { saved: true, name: basename(answer.path) };
        });
      },

      async pickDirectory(options, ctx) {
        const o = checkObject(options, true);
        const limit = checkLimit(o.limit);
        const forServer = checkFlag(o.forServer, "forServer");
        return exclusive(async () => {
          const answer = (await ctx.shell("panel.open", { directory: true })) as OpenAnswer;
          if ("cancelled" in answer || !answer.paths[0]) return { name: null, files: [], truncated: false };
          const picked = answer.paths[0];
          const { files, truncated } = listFiles(picked, limit);
          const mime = await mimes(ctx, files);
          if (forServer)
            return {
              name: basename(picked),
              grant: grantFile(picked, "folder", { dev: devGrant(ctx) }),
              files: files.map((rel) => ({
                ...ctx.registerFile(join(picked, rel), mime(rel)),
                name: basename(rel),
                path: rel,
              })),
              truncated,
            };
          const dir = stageDir(ctx);
          const out: DirectoryFile[] = files.map((rel, i) => ({
            ...toPicked(ctx, stage(dir, join(picked, rel), i, mime(rel))),
            path: rel,
          }));
          return { name: basename(picked), files: out, truncated };
        });
      },
    },
  });
}

export default createDesktopFilePicker();
