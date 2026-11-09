import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  type FrameworkChannelSpec,
  FrameworkMapBuilder,
  FrameworkMapDoc,
  type FrameworkSourcePackage,
} from "@akanjs/language";
import type { FrameworkMap } from "akanjs/common";
import ts from "typescript";

const packageSpecs: Omit<FrameworkSourcePackage, "root">[] = [
  { name: "akanjs", split: true },
  { name: "@akanjs/devkit", split: false },
];
const channelSpecs: FrameworkChannelSpec[] = [
  { file: "service/ipcTypes.ts", union: "AkanIpcMessage", label: "gateway ⇄ child" },
  { file: "server/artifact/ipcTypes.ts", union: "BuilderMessage", label: "dev host ⇄ builder, relayed to the child" },
  { file: "server/rscWorker.tsx", union: "InMsg", label: "server → RSC worker" },
  { file: "server/rscWorkerHost.ts", union: "RscInMsg", label: "RSC worker → server" },
  { file: "server/hmr/wsHub.ts", union: "HmrMessage", label: "dev server → browser tab", relays: ["HmrWsHub"] },
];
//? A published akanjs bundles use-agentic and @akanjs/native under `vendor/` and its declarations under `types/`;
//? devkit's `integration`, `csrE2e` and `platformTest` are test harnesses that run in no framework process.
const skippedDirs = new Set(["node_modules", "vendor", "types", "integration", "csrE2e", "platformTest"]);

export interface FrameworkArchitecture {
  file: string;
  current: string;
  next: string;
  unknownClasses: string[];
  map: FrameworkMap;
}

export class FrameworkGraph {
  static readonly architectureFile = "pkgs/akanjs/ARCHITECTURE.md";
  static readonly #cache = new Map<string, Promise<FrameworkMap | null>>();
  static readonly #edits = new Map<string, number>();

  static async packagesOf(workspaceRoot: string): Promise<FrameworkSourcePackage[]> {
    const found = await Promise.all(
      packageSpecs.map(async ({ name, split }) => {
        const root = (await FrameworkGraph.#isDir(path.join(workspaceRoot, "pkgs", name)))
          ? `pkgs/${name}`
          : await FrameworkGraph.#installedRoot(workspaceRoot, name);
        return root ? [{ name, root, split }] : [];
      }),
    );
    return found.flat();
  }

  static async build(workspaceRoot: string): Promise<FrameworkMap | null> {
    const packages = await FrameworkGraph.packagesOf(workspaceRoot);
    const akanjs = packages.find(({ name }) => name === "akanjs");
    if (!akanjs) return null;
    const files = (
      await Promise.all(packages.map(({ root }) => FrameworkGraph.#filesUnder(workspaceRoot, root)))
    ).flat();
    const texts = await Promise.all(
      files.map(async (file) => [file, await readFile(path.join(workspaceRoot, file), "utf8")] as [string, string]),
    );
    return new FrameworkMapBuilder({
      ts,
      packages,
      files: texts,
      channels: channelSpecs.map((spec) => ({ ...spec, file: `${akanjs.root}/${spec.file}` })),
    }).build();
  }

  //? Only the framework's own repository holds the document; a consumer's `node_modules/akanjs` is never rewritten.
  static async architecture(workspaceRoot: string): Promise<FrameworkArchitecture | null> {
    const file = path.join(workspaceRoot, FrameworkGraph.architectureFile);
    const current = await readFile(file, "utf8")
      .then((text) => text.replace(/\r\n/g, "\n"))
      .catch(() => null);
    const map = current === null ? null : await FrameworkGraph.build(workspaceRoot);
    if (current === null || !map || map.packages.find(({ name }) => name === "akanjs")?.root !== "pkgs/akanjs")
      return null;
    const next = FrameworkMapDoc.splice(
      current,
      FrameworkMapDoc.render(map, path.posix.dirname(FrameworkGraph.architectureFile)),
    );
    return {
      file,
      current,
      next,
      unknownClasses: FrameworkMapDoc.unknownClasses(next, map),
      map,
    };
  }

  static touched(workspaceRoot: string, files: string[]) {
    const roots = packageSpecs.map(({ name }) => path.join(workspaceRoot, "pkgs", name) + path.sep);
    if (files.some((file) => roots.some((root) => path.resolve(workspaceRoot, file).startsWith(root))))
      FrameworkGraph.#edits.set(workspaceRoot, (FrameworkGraph.#edits.get(workspaceRoot) ?? 0) + 1);
  }

  //? An installed framework changes only with its version; one in `pkgs/` changes with every save under it.
  static async cached(workspaceRoot: string): Promise<FrameworkMap | null> {
    const packages = await FrameworkGraph.packagesOf(workspaceRoot);
    const stamps = await Promise.all(
      packages.map(async ({ name, root }) =>
        root.startsWith("pkgs/")
          ? `${name}#${FrameworkGraph.#edits.get(workspaceRoot) ?? 0}`
          : `${name}@${await FrameworkGraph.#versionOf(path.join(workspaceRoot, root))}`,
      ),
    );
    const cacheKey = [workspaceRoot, ...stamps].join("\n");
    const existing = FrameworkGraph.#cache.get(cacheKey);
    if (existing) return await existing;
    const built = FrameworkGraph.build(workspaceRoot);
    built.catch(() => FrameworkGraph.#cache.delete(cacheKey));
    FrameworkGraph.#cache.clear();
    FrameworkGraph.#cache.set(cacheKey, built);
    return await built;
  }

  //? Bun resolves a bare name from its global cache when no `node_modules` exists, so one must; an install linked from
  //? outside the workspace is skipped, as its files have no workspace-relative path.
  static async #installedRoot(workspaceRoot: string, name: string): Promise<string | null> {
    if (!(await FrameworkGraph.#isDir(path.join(workspaceRoot, "node_modules")))) return null;
    const resolved = await (async () => {
      try {
        return path.dirname(await realpath(Bun.resolveSync(`${name}/package.json`, workspaceRoot)));
      } catch {
        const dir = path.join(workspaceRoot, "node_modules", name);
        return (await FrameworkGraph.#isDir(dir)) ? await realpath(dir) : null;
      }
    })();
    if (!resolved) return null;
    const root = path
      .relative(await realpath(workspaceRoot), resolved)
      .split(path.sep)
      .join("/");
    return root && !root.startsWith("..") && !path.isAbsolute(root) ? root : null;
  }

  static async #versionOf(dir: string) {
    return await readFile(path.join(dir, "package.json"), "utf8")
      .then((text) => (JSON.parse(text) as { version?: string }).version ?? "")
      .catch(() => "");
  }

  static async #isDir(dir: string) {
    return await stat(dir)
      .then((info) => info.isDirectory())
      .catch(() => false);
  }

  static async #filesUnder(workspaceRoot: string, root: string): Promise<string[]> {
    const entries = await readdir(path.join(workspaceRoot, root), { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || skippedDirs.has(entry.name)) continue;
      if (entry.isFile()) files.push(`${root}/${entry.name}`);
      else if (entry.isDirectory())
        for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({
          cwd: path.join(workspaceRoot, root, entry.name),
        }))
          if (!file.split(path.sep).includes("node_modules"))
            files.push(`${root}/${entry.name}/${file.split(path.sep).join("/")}`);
    }
    return files.filter((file) => FrameworkMapBuilder.isSourcePath(file)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
}
