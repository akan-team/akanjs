import fs from "node:fs";
import path from "node:path";
import { appGenerationOf, CSR_DEV_MANIFEST_FILE, type CsrDevManifest } from "akanjs/server/hmr/csrDevManifest";
import type { CsrDevCompileResult } from "./csrDevModuleCompiler";
import { CsrDevPaths } from "./csrDevPaths";
import { CsrDevResolver } from "./csrDevResolver";
import type { CsrDevCode, CsrDevContext, CsrDevGraph } from "./csrDevTypes";
import type { CsrDevUpdate, CsrDevUpdateOptions, DevRegistryBundler } from "./devRegistryBundler";

interface CsrDevPatcherState {
  graph: CsrDevGraph;
  manifest: CsrDevManifest;
  code: CsrDevCode | null;
}

export type CsrDevPatchResult =
  | { kind: "unchanged" }
  | { kind: "update"; update: CsrDevUpdate }
  | { kind: "delegate"; reason: string; generation: number; context: CsrDevContext; first?: boolean };

export interface CsrDevPatchOptions extends CsrDevUpdateOptions {
  /**
   * Run the whole-app builds a save can call for in this process: an npm module the graph has not seen, and the
   * resolution build for an import no recorded resolution answers. Without it the save is handed back to a build
   * worker, which exits and returns their memory (a resident builder that ran them sat at 1.3-1.5GB).
   */
  allowWholeAppBuilds?: boolean;
}

//* The incremental path of a dev module registry (CSR, or the client code of SSR pages). The resident builder keeps
//* one, so the graph, the manifest and every module's factory stay in memory between saves; a build worker makes a
//* throwaway one that starts from the disk. A save it hands back leaves the graph on disk as it was, so a worker still
//* sees those files as changed.
export class CsrDevPatcher {
  readonly #bundler: DevRegistryBundler;
  readonly #resident: boolean;
  #state: CsrDevPatcherState | null = null;

  constructor(bundler: DevRegistryBundler, { resident = false }: { resident?: boolean } = {}) {
    this.#bundler = bundler;
    this.#resident = resident;
  }

  /** Drops what it holds, so the next update starts from the disk a build worker may have rewritten. */
  forget(): void {
    this.#state = null;
  }

  async update(
    changedFiles: string[] = [],
    { announce, roots = [], onlyRoots = false, allowWholeAppBuilds = false }: CsrDevPatchOptions = {},
  ): Promise<CsrDevPatchResult> {
    const context = await this.#bundler.context();
    if (!context) return { kind: "unchanged" };
    const resident = this.#state;
    const state = resident ?? (await this.#load());
    if (!state) {
      const manifest = await this.#bundler.writer.readJson<CsrDevManifest>(CSR_DEV_MANIFEST_FILE);
      const reason = !manifest
        ? "first build"
        : (await this.#bundler.writer.isBuilding())
          ? "the last whole build was cut short"
          : "the dev bundle config changed";
      return this.#handBack(reason, (manifest?.generation ?? 0) + 1, context, { first: !manifest });
    }
    const generation = state.manifest.generation + 1;
    if (state.graph.configKey !== context.configKey)
      return this.#handBack("the dev bundle config changed", generation, context);
    const metadataFile = changedFiles.find((file) => this.#bundler.isMetadataFile(file));
    // `lib/useClient.ts` inlines signal and dictionary metadata through a macro at build time.
    if (metadataFile) return this.#handBack(`${path.basename(metadataFile)} changed`, generation, context);
    //? Only a registry read from disk: one held in memory saw every save since, and a metadata save was handed back.
    if (!resident && state.graph.metadata !== (await this.#bundler.metadataFingerprint()))
      return this.#handBack("signal or dictionary metadata changed since the registry was built", generation, context);
    this.#state = this.#resident ? state : null;
    //? Not over a module whose factory file is missing: this patch compiles it, and its commit writes app.js whole.
    if (appGenerationOf(state.manifest) < state.manifest.generation && this.#withoutFactory(state.graph).length === 0)
      state.manifest = await this.#bundler.writer.healApp(state.graph, state.manifest, await this.#code(state));
    return await this.#patch(context, state, changedFiles, generation, {
      announce,
      roots,
      onlyRoots,
      allowWholeAppBuilds,
    });
  }

  async #patch(
    context: CsrDevContext,
    state: CsrDevPatcherState,
    changedFiles: string[],
    generation: number,
    { announce, roots = [], onlyRoots = false, allowWholeAppBuilds }: CsrDevPatchOptions,
  ): Promise<CsrDevPatchResult> {
    const { paths, writer } = this.#bundler;
    const { graph } = state;
    const entries = await this.#bundler.writeEntries(context);
    const entryIds = this.#bundler.entryIds(entries.files);
    const forgotten = this.#forgetDeletedModules(state);
    const changed = onlyRoots ? new Set<string>() : await this.#changedModules(graph, changedFiles);
    for (const id of this.#withoutFactory(graph)) changed.add(id);
    for (const file of entries.changed) changed.add(paths.idOf(file));
    const rootFiles = [...Object.values(entries.files), ...roots.filter((file) => fs.existsSync(file))];
    for (const file of rootFiles) if (!graph.modules[paths.idOf(file)]) changed.add(paths.idOf(file));
    const carried = onlyRoots ? [] : await this.#carriedRoots(graph, changed);
    const routesMoved =
      this.#bundler.reloadsOnEntryChange &&
      (entries.changed.length > 0 || JSON.stringify(entryIds) !== JSON.stringify(graph.entries));
    if (changed.size === 0) {
      if (carried.length === 0) return { kind: "unchanged" };
      return await this.#retryCarried(context, state, carried, { announce, allowWholeAppBuilds });
    }

    // A fresh resolver per save: one kept across saves would stay past its prepass, and resolve the next new bare
    // import with Bun's runtime resolver, which ignores the `browser` condition.
    const resolver = new CsrDevResolver({
      paths,
      context,
      entryFiles: rootFiles.map((file) => CsrDevPaths.realpath(file)),
      resolution: graph.resolution,
      runtimeResolved: graph.runtimeResolved,
    });
    const known = new Set(Object.keys(graph.modules).map((id) => paths.fileOf(id)));
    let result: CsrDevCompileResult;
    try {
      result = await this.#bundler.compiler(context, resolver).compile(
        [...changed].map((id) => paths.fileOf(id)),
        known,
        { refuseNewVendor: !allowWholeAppBuilds, refusePrepass: !allowWholeAppBuilds },
      );
    } catch (error) {
      graph.pending = [...new Set([...changed, ...carried])];
      await writer.writeJson("graph.json", graph);
      throw error;
    }
    const refusal =
      result.refusedVendors.length > 0
        ? "an npm module joined the graph"
        : result.unresolved.length > 0
          ? `a new import needs the resolution build: ${result.unresolved[0]}`
          : null;
    if (refusal) {
      //? The entry files are already rewritten, so the worker would see them unchanged and patch a moved route table:
      //? a graph whose entries name none makes it reload instead.
      if (routesMoved) await writer.writeJson("graph.json", { ...graph, entries: {} });
      return this.#handBack(refusal, generation, context);
    }
    const compiled = result.modules;
    const vendorJoined = compiled.some((module) => module.vendor && !graph.modules[module.id]);
    //? Read before the merge: a new module's file is written after announcing, and one without a file is compiled now.
    const code = await this.#code(state);
    this.#bundler.merge(graph, resolver, compiled);
    graph.entries = entryIds;
    for (const module of compiled) {
      if (module.vendor || !code) continue;
      code.modules.set(module.id, module.factory);
      if (module.helpers) code.helpers.set(module.helpers.hash, module.helpers.definition);
    }
    const changedIds = compiled.filter((module) => !module.vendor).map((module) => module.id);
    const constantId = changedIds.find((id) => id.endsWith(".constant.ts"));
    // A model class swapped under live store state would mix old and new instances; reload instead.
    const reason = vendorJoined
      ? "an npm module joined the graph"
      : routesMoved
        ? "the route table changed"
        : constantId
          ? `${path.basename(constantId)} changed`
          : undefined;
    const previous = state.manifest;
    const next: CsrDevManifest = { ...previous, generation, entries: entryIds };
    const update = (patchUrl?: string): CsrDevUpdate => ({
      generation,
      reload: !!reason,
      reason,
      patchUrl,
      changedIds,
      moduleCount: Object.keys(graph.modules).length,
      epoch: previous.epoch,
    });
    // A reload rewrites app.js first: the tabs are about to boot from it.
    let outcome: CsrDevPatchResult;
    if (reason) {
      await writer.forgetPatch(generation);
      await writer.writeModules(compiled);
      const vendorFile = vendorJoined ? await writer.writeVendor(graph) : previous.vendorFile;
      await writer.writeApp(graph, { generation, vendorFile, epoch: previous.epoch }, code);
      state.manifest = { ...next, vendorFile, appGeneration: generation };
      await writer.writeState(graph, state.manifest);
      await writer.prune(vendorFile, generation);
      const reloaded = update();
      announce?.(reloaded);
      outcome = { kind: "update", update: reloaded };
    } else {
      const patched = update(
        await writer.writePatch(
          generation,
          compiled.filter((module) => !module.vendor),
        ),
      );
      await writer.commitPatch(
        graph,
        { ...next, appGeneration: appGenerationOf(previous) },
        () => announce?.(patched),
        { modules: compiled, code },
      );
      state.manifest = { ...next, appGeneration: generation };
      await writer.prune(previous.vendorFile, generation);
      outcome = { kind: "update", update: patched };
    }
    // Only now that graph.json no longer names them: a crash before it left a graph pointing at missing files.
    await writer.forgetModules(forgotten);
    if (carried.length > 0) await this.#retryCarried(context, state, carried, { announce, allowWholeAppBuilds });
    return outcome;
  }

  //? Compiled apart from the save: a new root that failed to compile, and that no module imports, must not fail every
  //? later save's round with it. Its error still reaches the overlay (this throws after the save's patch went out).
  async #retryCarried(
    context: CsrDevContext,
    state: CsrDevPatcherState,
    carried: string[],
    { announce, allowWholeAppBuilds }: CsrDevPatchOptions,
  ): Promise<CsrDevPatchResult> {
    const { paths } = this.#bundler;
    return await this.#patch(context, state, [], state.manifest.generation + 1, {
      announce,
      roots: carried.map((id) => paths.fileOf(id)),
      onlyRoots: true,
      allowWholeAppBuilds,
    });
  }

  //? A pending root outside the graph (a route's entry that failed to compile) is retried while a route still reaches
  //? it; one no route names any more (the page stopped importing it) leaves the pending list instead.
  async #carriedRoots(graph: CsrDevGraph, changed: Set<string>): Promise<string[]> {
    const { paths } = this.#bundler;
    const outside = graph.pending.filter(
      (id) => !graph.modules[id] && !changed.has(id) && CsrDevPaths.isNamed(paths.fileOf(id)),
    );
    if (outside.length === 0) return [];
    const wanted = await this.#bundler.wantedRoots(outside.map((id) => paths.fileOf(id)));
    const carried = outside.filter((id) => wanted.has(paths.fileOf(id)));
    graph.pending = graph.pending.filter((id) => graph.modules[id] || carried.includes(id));
    return carried;
  }

  // Missing factory files are recompiled, not read: a registry whose graph outlived them would fail every read.
  #withoutFactory(graph: CsrDevGraph): string[] {
    const { paths, writer } = this.#bundler;
    return Object.entries(graph.modules)
      .filter(([id, module]) => !module.vendor && !writer.hasModule(id) && CsrDevPaths.isNamed(paths.fileOf(id)))
      .map(([id]) => id);
  }

  #handBack(
    reason: string,
    generation: number,
    context: CsrDevContext,
    { first = false }: { first?: boolean } = {},
  ): CsrDevPatchResult {
    this.#state = null;
    return { kind: "delegate", reason, generation, context, ...(first ? { first } : {}) };
  }

  async #load(): Promise<CsrDevPatcherState | null> {
    const manifest = await this.#bundler.writer.readJson<CsrDevManifest>(CSR_DEV_MANIFEST_FILE);
    const graph = await this.#bundler.writer.readJson<CsrDevGraph>("graph.json");
    if (!manifest || !graph || graph.version !== 1 || (await this.#bundler.writer.isBuilding())) return null;
    return { graph, manifest, code: null };
  }

  // Only the resident patcher keeps factories: a worker writes app.js once, reading them from disk after announcing.
  async #code(state: CsrDevPatcherState): Promise<CsrDevCode | undefined> {
    if (!this.#resident) return undefined;
    state.code ??= await this.#bundler.writer.readCode(state.graph);
    return state.code;
  }

  async #changedModules(graph: CsrDevGraph, changedFiles: string[]): Promise<Set<string>> {
    const { paths } = this.#bundler;
    const changed = new Set<string>(graph.pending.filter((id) => graph.modules[id]));
    for (const file of changedFiles) {
      const id = paths.idOf(file);
      if (graph.modules[id]) changed.add(id);
    }
    for (const id of this.#shadowedImporters(graph, changedFiles)) changed.add(id);
    // Stat, not trust: a save made while CSR was unarmed, or a build that failed, never reached this graph. The hash
    // settles it because route discovery rewrites the generated layout wrappers, touching them on every call.
    for (const [id, module] of Object.entries(graph.modules)) {
      if (module.vendor || changed.has(id)) continue;
      const file = paths.fileOf(id);
      if (CsrDevPaths.mtimeOf(file) === module.mtimeMs) continue;
      if ((await CsrDevPaths.hashOf(file)) !== module.hash) changed.add(id);
    }
    // A dependency the graph lost: deleted and brought back (an undo in the file explorer), it compiles again; moved
    // away (`Foo.tsx` → `Foo/index.tsx`), its importers do, since their own text did not change and app.js would name
    // a module no longer defined.
    for (const [id, module] of Object.entries(graph.modules))
      for (const dep of module.deps) {
        if (graph.modules[dep] || CsrDevPaths.isStub(dep)) continue;
        if (CsrDevPaths.isNamed(paths.fileOf(dep))) changed.add(dep);
        else if (!module.vendor) changed.add(id);
      }
    return changed;
  }

  //? A new file can take over a relative import another module already resolved (`Foo.tsx` created beside
  //? `Foo/index.tsx`), with no change to that module's own text: it compiles again, and resolves against the disk.
  #shadowedImporters(graph: CsrDevGraph, changedFiles: string[]): string[] {
    const { paths } = this.#bundler;
    const bases = new Set(
      changedFiles
        .map((file) => CsrDevPaths.realpath(file))
        .filter((file) => !graph.modules[paths.idOf(file)] && CsrDevPaths.isScript(file) && fs.existsSync(file))
        .flatMap((file) => {
          const stem = file.slice(0, file.length - path.extname(file).length);
          return path.basename(stem) === "index" ? [stem, path.dirname(stem)] : [stem];
        }),
    );
    if (bases.size === 0) return [];
    return Object.entries(graph.resolution)
      .filter(([importer, bySpecifier]) => {
        if (!graph.modules[importer] || graph.modules[importer]?.vendor) return false;
        const dir = path.dirname(paths.fileOf(importer));
        return Object.keys(bySpecifier).some(
          (specifier) => specifier.startsWith(".") && bases.has(path.resolve(dir, specifier)),
        );
      })
      .map(([importer]) => importer);
  }

  // A deleted module leaves the graph instead of being rebuilt: rebuilding a missing file fails every save after it.
  // Its importers compile again with the next save (#changedModules): a move resolves anew, a deletion fails with the
  // error that says why. Its files stay until the graph on disk stops naming them.
  #forgetDeletedModules({ graph, code }: CsrDevPatcherState): string[] {
    const { paths } = this.#bundler;
    const deleted = Object.keys(graph.modules).filter(
      (id) => !graph.modules[id]?.vendor && !CsrDevPaths.isNamed(paths.fileOf(id)),
    );
    for (const id of deleted) {
      delete graph.modules[id];
      code?.modules.delete(id);
    }
    return deleted;
  }
}
