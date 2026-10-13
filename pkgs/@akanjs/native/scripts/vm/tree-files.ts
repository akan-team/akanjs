// What scripts/vm/windows.ts sync copies of a tree, and which left-out env files reach the VM as stubs.

import { readdirSync } from "node:fs";
import { join } from "node:path";

export interface TreeFiles {
  files: string[];
  left: number;
  stubs: string[];
}

//? .git, .claude (its worktrees) and local are gigabytes in the monorepo and nothing a VM build reads; no tracked
//? folder carries one of these names.
const SKIPPED = new Set(["node_modules", "target", ".akan", "dist", ".DS_Store", ".git", ".claude", "local"]);

//? For what git neither tracks nor ignores yet. `type` is generated and `example` committed; an edge profile's env is
//? what a carried server is built with, refused if it names a secret.
const isCredential = (name: string, isDir: boolean) =>
  isDir
    ? name === "secrets"
    : name === ".env" ||
      name.startsWith(".env.") ||
      (/^env\.server\..+\.ts$/.test(name) && !/^env\.server\.(type|example)\.ts$|\.edge\.ts$/.test(name));

//? Ignored, yet every build of the app imports it, and what it holds is shipped to the browser anyway.
const isClientEnv = (name: string) => /^env\.client\..+\.ts$/.test(name);

const isStubbed = (path: string, name: string) =>
  path === ".env" || (name.startsWith("env.server.") && isCredential(name, false));

const globs = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((glob) => glob.trim())
    .filter(Boolean)
    .map((glob) => new Bun.Glob(glob));

/** Relative to `root`, as git prints paths relative to the folder it runs in. */
function gitFiles(root: string, args: string[]): Set<string> {
  const p = Bun.spawnSync(["git", "-C", root, "ls-files", "-z", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  if (p.exitCode !== 0) throw new Error(`git ls-files in ${root} failed: ${p.stderr.toString().trim()}`);
  return new Set(p.stdout.toString().split("\0").filter(Boolean));
}

/**
 * `root`'s files, relative and `/`-separated, without build output, symlinks and what git ignores, and for another
 * tree (`guarded`) without the credentials it has not committed; `stubs` are the left-out env files the VM gets a
 * credential-free copy of. `exclude` leaves out more and `keep` takes back whole what would be left out:
 * comma-separated globs, matched against a path from the root and against a bare name.
 */
export function treeFiles(root: string, options: { guarded: boolean; exclude?: string; keep?: string }): TreeFiles {
  const extra = globs(options.exclude);
  const keep = globs(options.keep);
  const tracked = gitFiles(root, ["--cached"]);
  //? `--directory`: an ignored folder (node_modules, a secrets folder) is one `name/` entry, not every file in it.
  const ignored = gitFiles(root, ["--others", "--ignored", "--exclude-standard", "--directory"]);
  const files: string[] = [];
  const stubs: string[] = [];
  let left = 0;
  /** `kept`: under a folder taken back whole. `search`: under a left-out folder, where only a kept path goes. */
  const walk = (dir: string, kept: boolean, search: boolean) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (SKIPPED.has(entry.name) || entry.isSymbolicLink()) continue;
      const matches = (list: Bun.Glob[]) => list.some((glob) => glob.match(path) || glob.match(entry.name));
      if (matches(extra)) {
        if (!search) left++;
        continue;
      }
      const isDir = entry.isDirectory();
      const leftOut =
        search ||
        (ignored.has(isDir ? `${path}/` : path)
          ? !isClientEnv(entry.name)
          : options.guarded && !tracked.has(path) && isCredential(entry.name, isDir));
      if (leftOut && !kept && !matches(keep)) {
        if (!search) left++;
        if (!search && options.guarded && !isDir && isStubbed(path, entry.name)) stubs.push(path);
        if (isDir && keep.length) walk(path, false, true);
        continue;
      }
      if (isDir) walk(path, kept || leftOut, false);
      else files.push(path);
    }
  };
  walk("", false, false);
  return { files, left, stubs };
}
