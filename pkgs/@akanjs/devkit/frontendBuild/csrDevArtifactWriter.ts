import fs from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  appGenerationOf,
  CSR_DEV_APP_FILE,
  CSR_DEV_KEPT_PATCHES,
  CSR_DEV_MANIFEST_FILE,
  CSR_DEV_PATCHING_MARKER,
  type CsrDevLayout,
  type CsrDevManifest,
  csrDevModuleFile,
} from "akanjs/server/hmr/csrDevManifest";
import { FileSys } from "../fileSys";
import { CsrDevPaths } from "./csrDevPaths";
import type { CsrDevCode, CsrDevCompiledModule, CsrDevGraph } from "./csrDevTypes";

export interface CsrDevArtifactWriterOptions {
  /** Where the dev server serves `outDir`; a patch is announced by its URL. */
  routePrefix: string;
  /** `app.js` starts no entry: an SSR page requires the modules its RSC payload names, one at a time. */
  library?: boolean;
}

export class CsrDevArtifactWriter {
  static readonly #keptVendors = 3;
  static readonly #buildingMarker = ".building";
  readonly #outDir: string;
  readonly #routePrefix: string;
  readonly #library: boolean;

  constructor(outDir: string, { routePrefix, library = false }: CsrDevArtifactWriterOptions) {
    this.#outDir = outDir;
    this.#routePrefix = routePrefix;
    this.#library = library;
  }

  //? Set between a whole build's first write and its last: module files are named by id and overwritten in place, so a
  //? build cut short there leaves new modules under the previous graph and app.js, which no patch may read.
  async markBuilding(): Promise<void> {
    await Bun.write(path.join(this.#outDir, CsrDevArtifactWriter.#buildingMarker), String(process.pid));
  }

  async clearBuilding(): Promise<void> {
    await CsrDevArtifactWriter.#remove(path.join(this.#outDir, CsrDevArtifactWriter.#buildingMarker));
  }

  async isBuilding(): Promise<boolean> {
    return await Bun.file(path.join(this.#outDir, CsrDevArtifactWriter.#buildingMarker)).exists();
  }

  //? A reload's generation has no patch: one an attempt cut short left under that number would be applied by a tab
  //? catching up (catchUp reloads only when the file is missing).
  async forgetPatch(generation: number): Promise<void> {
    await Promise.all(
      [`patch-${generation}.js`, `patch-${generation}.js.layout.json`].map((name) =>
        CsrDevArtifactWriter.#remove(path.join(this.#outDir, name)),
      ),
    );
  }

  async readJson<T>(name: string): Promise<T | null> {
    const file = Bun.file(path.join(this.#outDir, name));
    if (!(await file.exists())) return null;
    return (await file.json().catch(() => null)) as T | null;
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    await this.#writeAtomic(name, JSON.stringify(value));
  }

  async writeModules(compiled: CsrDevCompiledModule[]): Promise<void> {
    await mkdir(path.join(this.#outDir, "modules"), { recursive: true });
    const helpers = new Map(
      compiled.flatMap((module) => (module.helpers ? [[module.helpers.hash, module.helpers]] : [])),
    );
    await Promise.all([
      ...compiled.flatMap((module) => [
        Bun.write(this.#modulePath(module.id, ".js"), module.factory),
        ...(module.sourceMap ? [Bun.write(this.#modulePath(module.id, ".js.map"), module.sourceMap)] : []),
      ]),
      ...[...helpers.values()].map((shared) => Bun.write(this.#helpersPath(shared.hash), shared.definition)),
    ]);
  }

  //? A module whose file is missing is left out rather than failing the read: the patcher compiles it again.
  async readCode(graph: CsrDevGraph): Promise<CsrDevCode> {
    const ids = Object.keys(graph.modules).filter((id) => !graph.modules[id]?.vendor && this.hasModule(id));
    const hashes = [...new Set(ids.flatMap((id) => graph.modules[id]?.helpers ?? []))];
    const [modules, helpers] = await Promise.all([
      Promise.all(ids.map(async (id) => [id, await Bun.file(this.#modulePath(id, ".js")).text()] as const)),
      Promise.all(hashes.map(async (hash) => [hash, await Bun.file(this.#helpersPath(hash)).text()] as const)),
    ]);
    return { modules: new Map(modules), helpers: new Map(helpers) };
  }

  hasModule(id: string): boolean {
    return fs.existsSync(this.#modulePath(id, ".js"));
  }

  async forgetModules(ids: string[]): Promise<void> {
    await Promise.all(
      ids.flatMap((id) => [
        CsrDevArtifactWriter.#remove(this.#modulePath(id, ".js")),
        CsrDevArtifactWriter.#remove(this.#modulePath(id, ".js.map")),
      ]),
    );
  }

  async writeVendor(graph: CsrDevGraph): Promise<string> {
    const ids = Object.keys(graph.modules)
      .filter((id) => graph.modules[id]?.vendor)
      .sort();
    const stubs = new Set(Object.values(graph.modules).flatMap((module) => module.deps.filter(CsrDevPaths.isStub)));
    const lines = [await this.#helperDefinitions(graph, ids), ...(await this.#defineLines(ids))];
    for (const stub of [...stubs].sort()) {
      if (stub.startsWith(CsrDevPaths.emptyStubPrefix)) {
        lines.push(`__akan.define(${JSON.stringify(stub)}, function () {});\n`);
        continue;
      }
      const message = `[akan-csr] ${stub.slice(CsrDevPaths.stubPrefix.length)} is a Node built-in the browser does not have`;
      lines.push(
        `__akan.define(${JSON.stringify(stub)}, function () {\n  throw new Error(${JSON.stringify(message)});\n});\n`,
      );
    }
    const code = lines.join("");
    const vendorFile = `vendor-${Bun.hash(code).toString(36)}.js`;
    await this.#writeAtomic(vendorFile, code);
    return vendorFile;
  }

  //? A library app.js names the vendor file and epoch it was built with: a tab that booted it beside another build's
  //? vendor file (a whole build landing between its render and its load) tells, and keeps the right epoch for hello.
  async writeApp(
    graph: CsrDevGraph,
    { generation, vendorFile, epoch }: Pick<CsrDevManifest, "generation" | "vendorFile" | "epoch">,
    code?: CsrDevCode,
  ): Promise<void> {
    const ids = Object.keys(graph.modules)
      .filter((id) => !graph.modules[id]?.vendor)
      .sort();
    const lines = await this.#defineLines(ids, code);
    const blocks = ids.map((id, index) => [id, lines[index] ?? ""] as [string, string]);
    const start = this.#library
      ? `__akan.startLibrary(${JSON.stringify({ generation, refresh: graph.refresh, bootstrap: graph.entries[""], vendorFile, epoch })});\n`
      : `__akan.start(${JSON.stringify({ generation, refresh: graph.refresh })});\n`;
    await this.#writeWithSourceMap(CSR_DEV_APP_FILE, await this.#helperDefinitions(graph, ids, code), blocks, start);
  }

  async writePatch(generation: number, modules: CsrDevCompiledModule[]): Promise<string> {
    const patchFile = `patch-${generation}.js`;
    const blocks = modules.map(
      (module, index) =>
        [module.id, `${JSON.stringify(module.id)}: ${module.factory}${index < modules.length - 1 ? ",\n" : "\n"}`] as [
          string,
          string,
        ],
    );
    const helpers = new Map(
      modules.flatMap((module) => (module.helpers ? [[module.helpers.hash, module.helpers]] : [])),
    );
    const header = `${[...helpers.values()].map((shared) => shared.definition).join("")}__akan.update(${generation}, {\n`;
    await this.#writeWithSourceMap(patchFile, header, blocks, "});\n");
    return `${this.#routePrefix}${patchFile}`;
  }

  // The manifest goes last: the server renders shells from it, so it must never name a file not yet written.
  async writeState(graph: CsrDevGraph, manifest: CsrDevManifest): Promise<void> {
    await this.writeJson("graph.json", graph);
    await this.writeJson(CSR_DEV_MANIFEST_FILE, manifest);
  }

  //? The open tabs need only the patch file and the manifest naming it, so they hear of a patch before the rest lands:
  //? the module files and graph.json (read only by the next build), then app.js (a full rewrite). The manifest says
  //? which generation app.js holds, and the shell holds a tab booting in that gap until it does. A crash in the gap is
  //? recovered by the next build, which sees the edited files' mtimes differ from graph.json and compiles them again.
  async commitPatch(
    graph: CsrDevGraph,
    manifest: CsrDevManifest,
    announce: () => void,
    { modules, code }: { modules: CsrDevCompiledModule[]; code?: CsrDevCode },
  ): Promise<void> {
    await this.writeJson(CSR_DEV_MANIFEST_FILE, manifest);
    announce();
    await CsrDevArtifactWriter.#appWriteDelay();
    await this.writeModules(modules);
    await this.writeJson("graph.json", graph);
    await this.writeApp(graph, manifest, code);
    await this.writeJson(CSR_DEV_MANIFEST_FILE, { ...manifest, appGeneration: manifest.generation });
  }

  // A process that died between announcing a patch and rewriting app.js left every booting tab one generation behind.
  async healApp(graph: CsrDevGraph, manifest: CsrDevManifest, code?: CsrDevCode): Promise<CsrDevManifest> {
    if (appGenerationOf(manifest) >= manifest.generation) return manifest;
    await this.writeApp(graph, manifest, code);
    const healed = { ...manifest, appGeneration: manifest.generation };
    await this.writeJson(CSR_DEV_MANIFEST_FILE, healed);
    return healed;
  }

  async prune(vendorFile: string, generation: number): Promise<void> {
    const names = await readdir(this.#outDir);
    const stale = names.filter((name) => {
      const patch = /^patch-(\d+)\.js(?:\.layout\.json)?$/.exec(name);
      return patch ? Number(patch[1]) <= generation - CSR_DEV_KEPT_PATCHES : false;
    });
    const vendors = names
      .filter((name) => /^vendor-[\w-]+\.js$/.test(name) && name !== vendorFile)
      .map((name) => ({ name, mtimeMs: CsrDevPaths.mtimeOf(path.join(this.#outDir, name)) }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(CsrDevArtifactWriter.#keptVendors - 1)
      .map(({ name }) => name);
    await Promise.all(
      [...stale, ...vendors].map((name) => CsrDevArtifactWriter.#remove(path.join(this.#outDir, name))),
    );
  }

  //? A whole build writes over the registry before it instead of clearing it first, so it clears what that one left:
  //? the modules and helpers it no longer holds, every patch (each was made against the previous registry), the assets
  //? this build did not write (by path: a file's mtime and this process's clock need not agree on a mounted volume),
  //? temp files of a write cut short, and the marker of a builder that died mid-patch.
  async pruneAfterFullBuild(
    graph: CsrDevGraph,
    vendorFile: string,
    { generation, assets }: { generation: number; assets: string[] },
  ): Promise<void> {
    const kept = new Set(
      Object.keys(graph.modules).flatMap((id) => [this.#modulePath(id, ".js"), this.#modulePath(id, ".js.map")]),
    );
    for (const module of Object.values(graph.modules)) if (module.helpers) kept.add(this.#helpersPath(module.helpers));
    for (const asset of assets) kept.add(path.resolve(asset));
    const listed = async (dir: string) =>
      (await readdir(path.join(this.#outDir, dir)).catch(() => [] as string[])).map((name) =>
        path.join(this.#outDir, dir, name),
      );
    const stale = [
      ...(await listed("modules")).filter((file) => !kept.has(file)),
      ...(await listed("assets")).filter((file) => !kept.has(file)),
      ...(await listed(".")).filter((file) => {
        const name = path.basename(file);
        return /^patch-\d+\.js(?:\.layout\.json)?$/.test(name) || name.endsWith(".tmp");
      }),
      path.join(this.#outDir, CSR_DEV_PATCHING_MARKER),
    ];
    await Promise.all(stale.map((file) => CsrDevArtifactWriter.#remove(file)));
    await this.prune(vendorFile, generation);
  }

  async #helperDefinitions(graph: CsrDevGraph, ids: string[], code?: CsrDevCode): Promise<string> {
    const hashes = [...new Set(ids.flatMap((id) => graph.modules[id]?.helpers ?? []))].sort();
    return (
      await Promise.all(hashes.map(async (hash) => code?.helpers.get(hash) ?? Bun.file(this.#helpersPath(hash)).text()))
    ).join("");
  }

  async #defineLines(ids: string[], code?: CsrDevCode): Promise<string[]> {
    return await Promise.all(
      ids.map(async (id) => {
        const factory = code?.modules.get(id) ?? (await Bun.file(this.#modulePath(id, ".js")).text());
        return `__akan.define(${JSON.stringify(id)}, ${factory});\n`;
      }),
    );
  }

  //? A factory's code starts on the line after its header, so each module's map is placed one line below it.
  async #writeWithSourceMap(name: string, header: string, blocks: [id: string, text: string][], footer: string) {
    const layout: CsrDevLayout = { lineCount: 0, modules: [] };
    let line = CsrDevPaths.lineCount(header);
    for (const [id, text] of blocks) {
      layout.modules.push([id, line + 1]);
      line += CsrDevPaths.lineCount(text);
    }
    const code = `${header}${blocks.map(([, text]) => text).join("")}${footer}//# sourceMappingURL=${name}.map\n`;
    layout.lineCount = CsrDevPaths.lineCount(code);
    await this.writeJson(`${name}.layout.json`, layout);
    await this.#writeAtomic(name, code);
  }

  // A rename is atomic: the dev server may be streaming the previous app.js to a reloading page right now.
  async #writeAtomic(name: string, content: string): Promise<void> {
    const target = path.join(this.#outDir, name);
    const temp = `${target}.${process.pid}.tmp`;
    await Bun.write(temp, content);
    await FileSys.replace(temp, target);
  }

  //? Best effort, after the tabs already have the update: Windows refuses to delete a file a reader holds open (the
  //? server streaming it to a tab), and throwing here would send a patch that already went out to a build worker.
  //? A file that stays is removed by a later prune.
  static async #remove(file: string): Promise<void> {
    await rm(file, { force: true }).catch(() => undefined);
  }

  //? A test-only hook that widens the gap between the patch and app.js, so an E2E can boot a tab inside it.
  static async #appWriteDelay(): Promise<void> {
    const ms = Number(process.env.AKAN_CSR_DEV_APP_WRITE_DELAY_MS);
    if (Number.isInteger(ms) && ms > 0) await Bun.sleep(ms);
  }

  #modulePath(id: string, extension: ".js" | ".js.map"): string {
    return path.join(this.#outDir, csrDevModuleFile(id, extension));
  }

  #helpersPath(hash: string): string {
    return path.join(this.#outDir, "modules", `helpers-${hash}.js`);
  }
}
