import fs from "node:fs";
import path from "node:path";
import { FileSys } from "../fileSys";
import { hasUseClientDirective, scanUseClientExports } from "../transforms/rscUseClientTransform";
import { CsrDevPaths } from "./csrDevPaths";

export interface ServerGraph {
  /** Real paths of the workspace sources the dev pages bundle read. */
  inputs: string[];
  /** Export names of every `"use client"` module among them: the server holds each only as a reference by name. */
  clientExports: Record<string, string[]>;
  /** Files saved in batches whose pages build failed since this graph was written: the next build's changes too. */
  carried?: string[];
}

//* What the dev server bundle read, written by every dev pages build that succeeds, so a save can be told apart as one
//* the server renders (it needs an RSC refresh) or one only the client registry holds. A failed build keeps the last
//* good graph and carries its files over, so the fixing save still refreshes what the failed ones changed.
export class ServerGraphFile {
  static readonly fileName = "server-graph.json";
  static #cache: { file: string; stamp: string; graph: ServerGraph } | null = null;

  static async read(artifactDir: string): Promise<ServerGraph | null> {
    const file = path.join(artifactDir, ServerGraphFile.fileName);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) return null;
    //? Not the mtime alone: two writes inside one mtime tick (seen on Linux) read back the first. A write replaces the
    //? file, so its inode moves too.
    const stamp = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    const cached = ServerGraphFile.#cache;
    if (cached?.file === file && cached.stamp === stamp) return cached.graph;
    const graph = (await Bun.file(file)
      .json()
      .catch(() => null)) as ServerGraph | null;
    if (graph) ServerGraphFile.#cache = { file, stamp, graph };
    return graph;
  }

  static async write(artifactDir: string, graph: ServerGraph): Promise<void> {
    const file = path.join(artifactDir, ServerGraphFile.fileName);
    const temp = `${file}.${process.pid}.tmp`;
    await Bun.write(temp, JSON.stringify(graph));
    await FileSys.replace(temp, file);
  }

  static async carry(artifactDir: string, files: string[]): Promise<void> {
    const graph = await ServerGraphFile.read(artifactDir);
    if (!graph || files.length === 0) return;
    const carried = [...new Set([...(graph.carried ?? []), ...files.map((file) => CsrDevPaths.realpath(file))])];
    await ServerGraphFile.write(artifactDir, { ...graph, carried });
  }

  // `exportsNow` answers a client module's current export names, or null once it is no longer one. `next` is the graph
  // the build just wrote: a changed file it reads for the first time (a module a failed import was waiting for) counts.
  static async touches(
    graph: ServerGraph | null,
    files: string[],
    exportsNow: (file: string) => string[] | null | Promise<string[] | null>,
    next?: ServerGraph | null,
  ): Promise<boolean> {
    if (!graph) return true;
    const inputs = new Set(graph.inputs);
    const joined = new Set((next?.inputs ?? []).filter((input) => !inputs.has(input)));
    for (const rawFile of files) {
      const file = CsrDevPaths.realpath(rawFile);
      if (joined.has(file)) return true;
      if (!inputs.has(file)) continue;
      const before = graph.clientExports[file];
      if (!before) return true;
      //? The server holds a "use client" module only as references by name: an edit that keeps them renders the same.
      const now = await exportsNow(file);
      if (!now || ServerGraphFile.#names(now) !== ServerGraphFile.#names(before)) return true;
    }
    return false;
  }

  static async clientExportsOf(file: string): Promise<string[] | null> {
    const source = await Bun.file(file)
      .text()
      .catch(() => null);
    if (source === null || !hasUseClientDirective(source)) return null;
    try {
      return scanUseClientExports(source, file);
    } catch {
      // A module the server can no longer read as client references is a server change; the pages build says why.
      return null;
    }
  }

  static #names(exports: string[]): string {
    return [...exports].sort().join(",");
  }
}
