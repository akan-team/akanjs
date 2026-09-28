import path from "node:path";
import { CsrDevPaths } from "./csrDevPaths";

export interface ServerGraph {
  /** Real paths of the workspace sources the dev pages bundle read. */
  inputs: string[];
  /** Export names of every `"use client"` module among them: the server holds each only as a reference by name. */
  clientExports: Record<string, string[]>;
}

//* What the dev server bundle read, written by every dev pages build, so a save can be told apart as one the server
//* renders (it needs an RSC refresh) or one only the client registry holds (its patch is the whole update).
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
    await Bun.write(path.join(artifactDir, ServerGraphFile.fileName), JSON.stringify(graph));
  }

  // `exportsNow` answers a client module's current export names, or null once it is no longer one.
  static async touches(
    graph: ServerGraph | null,
    files: string[],
    exportsNow: (file: string) => string[] | null | Promise<string[] | null>,
  ): Promise<boolean> {
    if (!graph) return true;
    const inputs = new Set(graph.inputs);
    for (const rawFile of files) {
      const file = CsrDevPaths.realpath(rawFile);
      if (!inputs.has(file)) continue;
      const before = graph.clientExports[file];
      if (!before) return true;
      //? The server holds a "use client" module only as references by name: an edit that keeps them renders the same.
      const now = await exportsNow(file);
      if (!now || ServerGraphFile.#names(now) !== ServerGraphFile.#names(before)) return true;
    }
    return false;
  }

  static #names(exports: string[]): string {
    return [...exports].sort().join(",");
  }
}
