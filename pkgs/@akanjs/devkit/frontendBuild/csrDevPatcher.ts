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
  //? A pending root handed to a worker, by the hash it had: one that fails there too waits for an edit of its own or of
  //? a file the worker failed in, instead of sending every save to a worker.
  readonly #delegated = new Map<string, { hash: string; failed?: Record<string, string>; before: string }>();

  constructor(bundler: DevRegistryBundler, { resident = false }: { resident?: boolean } = {}) {
    this.#bundler = bundler;
    this.#resident = resident;
  }

  /** Drops what it holds, so the next update starts from the disk a build worker may have rewritten. */
  forget(): void {
    this.#state = null;
  }

  /** Roots handed to a worker that died before it wrote their failure: the next round hands them over again. */
  releaseHandedOver(): void {
    for (const [id, handedOver] of this.#delegated) if (!handedOver.failed) this.#delegated.delete(id);
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
    const healable =
      appGenerationOf(state.manifest) < state.manifest.generation &&
      this.#withoutFactory(state, (file) => fs.existsSync(file)).length === 0;
    if (healable)
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
    const present = CsrDevPatcher.#presence(changedFiles);
    const forgotten = this.#forgetDeletedModules(state, present);
    const changed = onlyRoots ? new Set<string>() : await this.#changedModules(graph, changedFiles, present);
    for (const id of this.#withoutFactory(state, present)) changed.add(id);
    for (const file of entries.changed) changed.add(paths.idOf(file));
    const rootFiles = [...Object.values(entries.files), ...roots.filter((file) => fs.existsSync(file))];
    for (const file of rootFiles) {
      const id = paths.idOf(file);
      if (!graph.modules[id] && !(onlyRoots && (await this.#parked(graph, id)))) changed.add(id);
    }
    const carried = onlyRoots ? [] : await this.#carriedRoots(graph, changed, present);
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
    const compile = async (ids: string[]) =>
      await this.#bundler.compiler(context, resolver).compile(
        ids.map((id) => paths.fileOf(id)),
        known,
        { refuseNewVendor: !allowWholeAppBuilds, refusePrepass: !allowWholeAppBuilds },
      );
    let result: CsrDevCompileResult;
    let orphans: string[];
    try {
      ({ result, orphans } = await this.#compileLeavingOrphans(compile, graph, changed));
      for (const module of result.modules) known.add(module.file);
      result = await this.#withTwinImporters(compile, graph, result);
    } catch (error) {
      //? Joined, not replaced: a route's root another round failed stays pending for its own retry.
      graph.pending = [...new Set([...graph.pending, ...changed, ...carried])];
      if (!this.#resident)
        graph.failed = {
          roots: [...changed, ...carried],
          files: await CsrDevPatcher.#hashesOf(paths, CsrDevPatcher.#implicatedFiles(error)),
        };
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
      if (onlyRoots)
        for (const id of changed)
          if (!graph.modules[id])
            this.#delegated.set(id, {
              hash: await CsrDevPaths.hashOf(paths.fileOf(id)),
              before: JSON.stringify(graph.failed ?? null),
            });
      return this.#handBack(refusal, generation, context);
    }
    const compiled = result.modules;
    const vendorJoined = compiled.some((module) => module.vendor && !graph.modules[module.id]);
    //? Read before the merge: a new module's file is written after announcing, and one without a file is compiled now.
    const code = await this.#code(state);
    for (const id of [...orphans, ...this.#caseTwins(graph, compiled)]) {
      delete graph.modules[id];
      resolver.forget(paths.fileOf(id));
      code?.modules.delete(id);
      forgotten.push(id);
    }
    graph.pending = graph.pending.filter((id) => !orphans.includes(id));
    this.#bundler.merge(graph, resolver, compiled);
    if (!this.#resident) delete graph.failed;
    for (const module of compiled) this.#delegated.delete(module.id);
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
    //? Only orphans left the graph: nothing a tab holds changed, so no patch goes out.
    if (compiled.length === 0 && !reason) {
      await writer.writeJson("graph.json", graph);
      await writer.forgetModules(forgotten);
      if (carried.length === 0) return { kind: "unchanged" };
      return await this.#retryCarried(context, state, carried, { announce, allowWholeAppBuilds });
    }
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
    if (carried.length === 0) return outcome;
    const retried = await this.#retryCarried(context, state, carried, { announce, allowWholeAppBuilds });
    return retried.kind === "delegate" ? retried : outcome;
  }

  //? Compiled apart from the save: a new root that failed to compile, and that no module imports, must not fail every
  //? later save's round with it. Its error still reaches the overlay (this throws after the save's patch went out).
  async #retryCarried(
    context: CsrDevContext,
    state: CsrDevPatcherState,
    carried: string[],
    { announce, allowWholeAppBuilds }: CsrDevPatchOptions,
  ): Promise<CsrDevPatchResult> {
    const { paths, writer } = this.#bundler;
    const retried = await this.#patch(context, state, [], state.manifest.generation + 1, {
      announce,
      roots: carried.map((id) => paths.fileOf(id)),
      onlyRoots: true,
      allowWholeAppBuilds,
    });
    //? Handed to a worker (a new npm import in the fixed root): the graph keeps them pending, so the worker retries
    //? them with whole-app builds allowed instead of never hearing of them.
    if (retried.kind === "delegate") {
      state.graph.pending = [...new Set([...state.graph.pending, ...carried])];
      await writer.writeJson("graph.json", state.graph);
    }
    return retried;
  }

  //? One Bun.build fails whole: a module that fails to compile and that nothing reaches any more (its last importer
  //? dropped the import in this very save) leaves the graph, where it would fail every later save until fixed itself.
  //? Everything else the roots stopped reaching goes with it, or an importer left behind would bring it back.
  async #compileLeavingOrphans(
    compile: (ids: string[]) => Promise<CsrDevCompileResult>,
    graph: CsrDevGraph,
    changed: Set<string>,
  ): Promise<{ result: CsrDevCompileResult; orphans: string[] }> {
    const { paths } = this.#bundler;
    try {
      return { result: await compile([...changed]), orphans: [] };
    } catch (error) {
      const failing = new Set(CsrDevPatcher.#failingFiles(error).map((file) => paths.idOf(file)));
      const broken = [...changed].filter((id) => failing.has(id) && graph.modules[id]);
      if (broken.length === 0) throw error;
      const rest = [...changed].filter((id) => !broken.includes(id));
      const empty: CsrDevCompileResult = { modules: [], refusedVendors: [], unresolved: [] };
      const result =
        rest.length === 0
          ? empty
          : await compile(rest).catch(() => {
              throw error;
            });
      const modules = { ...graph.modules };
      for (const module of result.modules)
        modules[module.id] = {
          vendor: module.vendor,
          mtimeMs: module.mtimeMs,
          hash: module.hash,
          deps: module.deps.map((dep) => (CsrDevPaths.isStub(dep) ? dep : paths.idOf(dep))),
        };
      const reached = await this.#bundler.reachable({ ...graph, modules });
      if (broken.some((id) => reached.has(id))) throw error;
      const orphans = Object.keys(modules).filter((id) => !reached.has(id) && !modules[id]?.vendor);
      return { result, orphans };
    }
  }

  //? A case-only rename the patcher never saw (made while CSR was unarmed) compiles under the disk's spelling: the old
  //? id goes, or its stale mtime would compile it again on every save. Only where the disk folds case: on ext4 the two
  //? spellings are two files.
  #caseTwins(graph: CsrDevGraph, compiled: CsrDevCompileResult["modules"]): string[] {
    const { paths } = this.#bundler;
    const idsByFold = new Map<string, string[]>();
    for (const id of Object.keys(graph.modules))
      idsByFold.set(id.toLowerCase(), [...(idsByFold.get(id.toLowerCase()) ?? []), id]);
    return compiled.flatMap((module) =>
      (idsByFold.get(module.id.toLowerCase()) ?? []).filter(
        (id) => id !== module.id && !graph.modules[id]?.vendor && !CsrDevPaths.isNamed(paths.fileOf(id)),
      ),
    );
  }

  //? Their importers compile in the same round: one still importing the old spelling (valid on a disk that folds case)
  //? would otherwise require a module app.js no longer defines.
  async #withTwinImporters(
    compile: (ids: string[]) => Promise<CsrDevCompileResult>,
    graph: CsrDevGraph,
    result: CsrDevCompileResult,
  ): Promise<CsrDevCompileResult> {
    const twins = new Set(this.#caseTwins(graph, result.modules));
    if (twins.size === 0) return result;
    const compiledIds = new Set(result.modules.map((module) => module.id));
    const importers = Object.entries(graph.modules)
      .filter(([id, module]) => !module.vendor && !compiledIds.has(id) && !twins.has(id))
      .filter(([, module]) => module.deps.some((dep) => twins.has(dep)))
      .map(([id]) => id);
    if (importers.length === 0) return result;
    const more = await compile(importers);
    return {
      modules: [...result.modules, ...more.modules],
      refusedVendors: [...result.refusedVendors, ...more.refusedVendors],
      unresolved: [...result.unresolved, ...more.unresolved],
    };
  }

  //? Where it failed, and the files its messages name: Bun puts a missing export at the importer and names the module
  //? that lacks it only in the text ("No matching export in \"../ui/C.tsx\""), relative to the working directory.
  static #implicatedFiles(error: unknown): string[] {
    const failing = CsrDevPatcher.#failingFiles(error);
    const messages: unknown[] = error instanceof AggregateError ? error.errors : [];
    const named = messages.flatMap((message) => {
      const text = String((message as { message?: unknown }).message ?? "");
      const bases = [process.cwd(), ...failing.map((file) => path.dirname(file))];
      return [...text.matchAll(/"([^"\n]+)"/g)].flatMap(([, quoted = ""]) => {
        const found = bases
          .map((base) => path.resolve(base, quoted))
          .find((file) => CsrDevPaths.isScript(file) && fs.existsSync(file));
        return found ? [CsrDevPaths.realpath(found)] : [];
      });
    });
    return [...new Set([...failing, ...named])];
  }

  static #failingFiles(error: unknown): string[] {
    const messages: unknown[] = error instanceof AggregateError ? error.errors : [];
    return messages
      .map((message) => (message as { position?: { file?: unknown } | null }).position?.file)
      .filter((file): file is string => typeof file === "string" && path.isAbsolute(file))
      .map((file) => CsrDevPaths.realpath(file));
  }

  //? A pending root outside the graph (a route's entry that failed to compile) is retried while a route still reaches
  //? it; one no route names any more (the page stopped importing it) leaves the pending list instead.
  async #carriedRoots(graph: CsrDevGraph, changed: Set<string>, present: (file: string) => boolean): Promise<string[]> {
    const { paths } = this.#bundler;
    const outside = graph.pending.filter((id) => !graph.modules[id] && !changed.has(id) && present(paths.fileOf(id)));
    if (outside.length === 0) return [];
    const wanted = await this.#bundler.wantedRoots(
      outside.map((id) => paths.fileOf(id)),
      graph,
    );
    const kept = outside.filter((id) => wanted.has(paths.fileOf(id)));
    graph.pending = graph.pending.filter((id) => graph.modules[id] || kept.includes(id));
    const carried: string[] = [];
    for (const id of kept) if (!(await this.#parked(graph, id))) carried.push(id);
    return carried;
  }

  //? The worker's failure is read from the graph it wrote, once, and only a round that built this root. Until that
  //? worker writes, the record on disk is the one from before the hand-over, and the root waits for it.
  async #parked(graph: CsrDevGraph, id: string): Promise<boolean> {
    const { paths } = this.#bundler;
    const handedOver = this.#delegated.get(id);
    if (!handedOver || handedOver.hash !== (await CsrDevPaths.hashOf(paths.fileOf(id)))) return false;
    if (!handedOver.failed) {
      if (JSON.stringify(graph.failed ?? null) === handedOver.before) return true;
      if (graph.failed?.roots.includes(id)) handedOver.failed = graph.failed.files;
    }
    if (!handedOver.failed) return false;
    for (const [failedId, hash] of Object.entries(handedOver.failed))
      if ((await CsrDevPaths.hashOf(paths.fileOf(failedId))) !== hash) return false;
    return true;
  }

  static async #hashesOf(paths: CsrDevPaths, files: string[]): Promise<Record<string, string>> {
    return Object.fromEntries(
      await Promise.all(files.map(async (file) => [paths.idOf(file), await CsrDevPaths.hashOf(file)] as const)),
    );
  }

  // Missing factory files are recompiled, not read: a registry whose graph outlived them would fail every read. The
  // resident patcher holds every factory it has read or written, so only a registry just read from disk is stat'ed.
  #withoutFactory({ graph, code }: CsrDevPatcherState, present: (file: string) => boolean): string[] {
    const { paths, writer } = this.#bundler;
    const hasFactory = (id: string) => (code ? code.modules.has(id) : writer.hasModule(id));
    return Object.entries(graph.modules)
      .filter(([id, module]) => !module.vendor && !hasFactory(id) && present(paths.fileOf(id)))
      .map(([id]) => id);
  }

  //? A case-only rename is the one move `existsSync` misses (`ui/card.tsx` still exists after a rename to
  //? `ui/Card.tsx` on APFS and NTFS), and it reaches the patcher as a save of both names: the realpath of every
  //? module is paid for only then (2.2ms a save on a 385-module registry, against 0.3ms). One it never saw goes with
  //? the compile that meets the new spelling (#caseTwins).
  static #presence(changedFiles: string[]): (file: string) => boolean {
    const caseMoved = changedFiles.some((file) => fs.existsSync(file) && !CsrDevPaths.isNamed(file));
    return caseMoved ? (file) => CsrDevPaths.isNamed(file) : (file) => fs.existsSync(file);
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

  async #changedModules(
    graph: CsrDevGraph,
    changedFiles: string[],
    present: (file: string) => boolean,
  ): Promise<Set<string>> {
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
    //? Not through an importer compiling anyway: its deps in the graph are the ones before this save, and its own
    //? compile follows whatever it still imports, where a dropped import would keep a broken file failing every save.
    for (const [id, module] of Object.entries(graph.modules)) {
      if (changed.has(id)) continue;
      for (const dep of module.deps) {
        if (graph.modules[dep] || CsrDevPaths.isStub(dep)) continue;
        //? Named, not only present: a dep a case rename replaced still exists under its old spelling.
        const file = paths.fileOf(dep);
        if (present(file) && CsrDevPaths.isNamed(file)) changed.add(dep);
        else if (!module.vendor) changed.add(id);
      }
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
  #forgetDeletedModules({ graph, code }: CsrDevPatcherState, present: (file: string) => boolean): string[] {
    const { paths } = this.#bundler;
    const deleted = Object.keys(graph.modules).filter((id) => !graph.modules[id]?.vendor && !present(paths.fileOf(id)));
    for (const id of deleted) {
      delete graph.modules[id];
      code?.modules.delete(id);
    }
    return deleted;
  }
}
