import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { hasUseClientDirective, scanUseClientExports } from "../transforms/rscUseClientTransform";
import { CsrDevPaths } from "./csrDevPaths";

export interface ServerGraph {
  /** Real paths of the workspace sources the dev pages bundle read. */
  inputs: string[];
  /** Export names of every `"use client"` module among them: the server holds each only as a reference by name. */
  clientExports: Record<string, string[]>;
}

//* What the dev server bundle read, written by every dev pages build that succeeds and removed by one that fails, so a
//* save can be told apart as one the server renders (it needs an RSC refresh) or one only the client registry holds.
export class ServerGraphFile {
  static readonly fileName = "server-graph.json";
  static #cache: { file: string; mtimeMs: number; graph: ServerGraph } | null = null;

  static async read(artifactDir: string): Promise<ServerGraph | null> {
    const file = path.join(artifactDir, ServerGraphFile.fileName);
    const mtimeMs = CsrDevPaths.mtimeOf(file);
    if (mtimeMs < 0) return null;
    const cached = ServerGraphFile.#cache;
    if (cached?.file === file && cached.mtimeMs === mtimeMs) return cached.graph;
    const graph = (await Bun.file(file)
      .json()
      .catch(() => null)) as ServerGraph | null;
    if (graph) ServerGraphFile.#cache = { file, mtimeMs, graph };
    return graph;
  }

  static async write(artifactDir: string, graph: ServerGraph): Promise<void> {
    const file = path.join(artifactDir, ServerGraphFile.fileName);
    const temp = `${file}.${process.pid}.tmp`;
    await Bun.write(temp, JSON.stringify(graph));
    await rename(temp, file);
  }

  //? After a failed build the last graph is older than what the server renders next; without one, the next save counts
  //? as touching the server, which is always safe.
  static async clear(artifactDir: string): Promise<void> {
    await rm(path.join(artifactDir, ServerGraphFile.fileName), { force: true });
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
