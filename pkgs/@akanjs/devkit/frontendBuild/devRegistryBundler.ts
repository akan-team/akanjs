import path from "node:path";
import type { App } from "../commandDecorators";
import { CsrDevArtifactWriter } from "./csrDevArtifactWriter";
import { CsrDevModuleCompiler } from "./csrDevModuleCompiler";
import { CsrDevPatcher } from "./csrDevPatcher";
import { CsrDevPaths } from "./csrDevPaths";
import { CsrDevResolver } from "./csrDevResolver";
import type { CsrDevCompiledModule, CsrDevContext, CsrDevGraph } from "./csrDevTypes";

export interface CsrDevUpdate {
  generation: number;
  reload: boolean;
  reason?: string;
  patchUrl?: string;
  changedIds: string[];
  moduleCount: number;
  epoch?: number;
  /** The registry did not exist before this build, so no tab holds a module of it. */
  first?: boolean;
}

export interface CsrDevUpdateOptions {
  /** Called once an update exists: for a patch before app.js is rewritten, for a reload after everything is on disk. */
  announce?: (update: CsrDevUpdate) => void;
  /** Files the registry must hold once this update is done; the ones it lacks are compiled into it. */
  roots?: string[];
}

export interface DevRegistryTarget {
  dirName: string;
  routePrefix: string;
  library: boolean;
}

//* A dev module registry under `.akan/artifact/<dirName>`: this owns the context, the entries and the full build;
//* `CsrDevPatcher` owns the incremental path, which the resident builder keeps in memory between saves.
export abstract class DevRegistryBundler {
  readonly outDir: string;
  readonly routePrefix: string;
  readonly paths: CsrDevPaths;
  readonly writer: CsrDevArtifactWriter;
  protected readonly app: App;
  protected readonly entryDir: string;
  /** A CSR entry holds the route table, so moving one reloads the tab; an SSR root is one more module to hold. */
  abstract readonly reloadsOnEntryChange: boolean;

  constructor(app: App, { dirName, routePrefix, library }: DevRegistryTarget) {
    this.app = app;
    this.routePrefix = routePrefix;
    this.paths = new CsrDevPaths(app.workspace.workspaceRoot);
    this.outDir = path.join(app.cwdPath, ".akan/artifact", dirName);
    this.entryDir = path.join(app.cwdPath, ".akan/generated", dirName);
    this.writer = new CsrDevArtifactWriter(this.outDir, { routePrefix, library });
  }

  /** Null when there is nothing to build. */
  abstract context(): Promise<CsrDevContext | null>;

  abstract writeEntries(context: CsrDevContext): Promise<{ files: Record<string, string>; changed: string[] }>;

  /** Every file a full build compiles from, the entries included. */
  protected abstract rootFiles(entryFiles: string[]): Promise<string[]>;

  // A build worker: a throwaway patcher that starts from the disk, and builds everything itself when it cannot patch.
  async update(changedFiles: string[] = [], options: CsrDevUpdateOptions = {}): Promise<CsrDevUpdate | null> {
    const result = await new CsrDevPatcher(this).update(changedFiles, { ...options, allowWholeAppBuilds: true });
    if (result.kind === "unchanged") return null;
    if (result.kind === "update") return result.update;
    const built = await this.fullBuild(result.context, result.generation, result.reason);
    const update = result.first ? { ...built, first: true } : built;
    options.announce?.(update);
    return update;
  }

  async fullBuild(context: CsrDevContext, generation: number, reason: string): Promise<CsrDevUpdate> {
    await this.writer.reset();
    const entries = await this.writeEntries(context);
    const roots = await this.rootFiles(Object.values(entries.files));
    const resolver = new CsrDevResolver({ paths: this.paths, context, entryFiles: roots });
    await resolver.prepass();
    const { modules: compiled } = await this.compiler(context, resolver).compile(
      [...roots, ...(context.refreshFile ? [context.refreshFile] : [])],
      new Set(),
    );
    const graph: CsrDevGraph = {
      version: 1,
      configKey: context.configKey,
      refresh: context.refreshFile
        ? this.paths.idOf(context.refreshFile)
        : `${CsrDevPaths.vendorPrefix}react-refresh/runtime`,
      entries: this.entryIds(entries.files),
      modules: {},
      resolution: {},
      pending: [],
    };
    this.merge(graph, resolver, compiled);
    await this.writer.writeModules(compiled);
    const vendorFile = await this.writer.writeVendor(graph);
    await this.writer.writeApp(graph, generation);
    const epoch = Date.now();
    await this.writer.writeState(graph, { version: 1, generation, vendorFile, entries: graph.entries, epoch });
    await this.writer.prune(vendorFile, generation);
    return { generation, reload: true, reason, changedIds: [], moduleCount: Object.keys(graph.modules).length, epoch };
  }

  compiler(context: CsrDevContext, resolver: CsrDevResolver): CsrDevModuleCompiler {
    return new CsrDevModuleCompiler({
      app: this.app,
      paths: this.paths,
      resolver,
      context,
      outDir: this.outDir,
      routePrefix: this.routePrefix,
    });
  }

  merge(graph: CsrDevGraph, resolver: CsrDevResolver, compiled: CsrDevCompiledModule[]): void {
    for (const module of compiled)
      graph.modules[module.id] = {
        vendor: module.vendor,
        mtimeMs: module.mtimeMs,
        hash: module.hash,
        deps: module.deps.map((dep) => (CsrDevPaths.isStub(dep) ? dep : this.paths.idOf(dep))),
        ...(module.helpers ? { helpers: module.helpers.hash } : {}),
      };
    graph.pending = [];
    graph.resolution = resolver.serialize();
  }

  entryIds(files: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(files).map(([key, file]) => [key, this.paths.idOf(file)]));
  }
}
