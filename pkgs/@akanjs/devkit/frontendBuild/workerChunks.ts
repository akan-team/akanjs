import { rename } from "node:fs/promises";
import path from "node:path";
import { CLIENT_BUNDLE_NAMING, type MetafileOutput } from "./clientBuildTypes";

export interface WorkerChunkBuild {
  outdir: string;
  define: Record<string, string>;
  conditions: string[];
  minify: boolean;
}

//? A module that hands its own URL to `new Worker` runs again in a worker, which reads no import map and has no
//? `window`. Bun puts its runtime helpers (`__require`, `__toESM`) in whichever chunk it picks, a page's included, so
//? that module's chunk can import page code; it is rebuilt into the same file on its own, every import inlined.
export class WorkerChunks {
  static readonly #ownUrl = /\bnew\s+URL\(\s*import\.meta\.url\s*\)/;
  static readonly #listens = /\bself\.(?:onmessage\s*=|addEventListener\(\s*["']message["'])/;

  static isWorkerSource(source: string): boolean {
    return WorkerChunks.#ownUrl.test(source) && WorkerChunks.#listens.test(source);
  }

  static async seal(
    outputs: ReadonlyMap<string, MetafileOutput>,
    entries: ReadonlySet<string>,
    moduleOf: (entryPoint: string) => string,
    build: WorkerChunkBuild,
  ): Promise<string[]> {
    const sealed: string[] = [];
    for (const [chunk, info] of outputs) {
      if (!chunk.endsWith(".js") || !info.entryPoint) continue;
      const module = moduleOf(info.entryPoint);
      if (entries.has(module) || !(await Bun.file(module).exists())) continue;
      if (!WorkerChunks.isWorkerSource(await Bun.file(module).text())) continue;
      await WorkerChunks.#rebuild(module, chunk, build);
      sealed.push(chunk);
    }
    return sealed;
  }

  static async #rebuild(module: string, chunk: string, build: WorkerChunkBuild): Promise<void> {
    const directory = path.relative(build.outdir, path.dirname(chunk)).split(path.sep).join("/");
    const result = await Bun.build({
      entrypoints: [module],
      outdir: build.outdir,
      target: "browser",
      format: "esm",
      splitting: false,
      minify: build.minify,
      define: build.define,
      conditions: build.conditions,
      //? Beside the chunk it replaces, so a URL it builds from its own reads the same assets.
      naming: { entry: `${directory ? `${directory}/` : ""}[hash]-worker.[ext]`, asset: CLIENT_BUNDLE_NAMING.asset },
    });
    if (!result.success)
      throw new AggregateError(result.logs, `[WorkerChunks] could not rebuild ${module} for a worker`);
    const built = result.outputs.find((output) => output.kind === "entry-point");
    if (!built) throw new Error(`[WorkerChunks] the rebuild of ${module} wrote no entry`);
    await rename(built.path, chunk);
  }
}
