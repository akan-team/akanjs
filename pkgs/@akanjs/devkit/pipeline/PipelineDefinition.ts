import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppPipelineConfig, WorkspacePipelineConfig } from "akanjs";
import type { PipelineDiagnostic, PipelinePlanContext, PipelinePlanResult } from "akanjs/common";
import { toError } from "akanjs/common";
import { AkanAppConfig, AkanWorkspaceConfig } from "../akanConfig";
import { AppExecutor, type WorkspaceExecutor } from "../executors";
import { FileSys } from "../fileSys";
import { resolveMobileTargets } from "../mobile/mobileTarget";
import { PipelineCompiler, type PipelineNativeTargets, type PipelineSourceFile } from "./PipelineCompiler";

/**
 * The workspace root config and each app's, for one run. Loading evaluates the workspace's own TypeScript, so a plan is
 * made where that code may run (the build pod) and what leaves is data only.
 */
export class PipelineDefinition {
  static async load(workspace: WorkspaceExecutor, apps: readonly string[]) {
    const definition = new PipelineDefinition(workspace);
    await definition.#load(apps);
    return definition;
  }

  readonly diagnostics: PipelineDiagnostic[] = [];
  readonly appSources = new Map<string, PipelineSourceFile<AppPipelineConfig>>();
  readonly nativeTargets = new Map<string, PipelineNativeTargets>();
  workspaceApps: string[] = [];
  workspaceSource: PipelineSourceFile<WorkspacePipelineConfig> | null = null;
  readonly #workspace: WorkspaceExecutor;

  constructor(workspace: WorkspaceExecutor) {
    this.#workspace = workspace;
  }

  compile(context: PipelinePlanContext, { sampled = false }: { sampled?: boolean } = {}): PipelinePlanResult {
    return PipelineCompiler.compile({
      context,
      workspaceApps: this.workspaceApps,
      workspace: this.workspaceSource,
      apps: this.appSources,
      nativeTargets: this.nativeTargets,
      akanVersion: AkanAppConfig.akanVersion,
      sampled,
      diagnostics: this.diagnostics,
    });
  }

  async #load(apps: readonly string[]) {
    this.workspaceApps = (await this.#workspace.getApps()).sort();
    this.workspaceSource = await this.#loadWorkspace();
    for (const app of new Set(apps)) {
      if (!this.workspaceApps.includes(app)) continue;
      const source = await this.#loadApp(app);
      this.appSources.set(app, source);
      if (PipelineDefinition.#mayTakeOta(source.pipeline))
        this.nativeTargets.set(app, await this.#loadNativeTargets(app));
    }
  }

  //? A function form is only known once the compiler runs it, so it pays for the config load either way.
  static #mayTakeOta(pipeline: AppPipelineConfig | null) {
    if (typeof pipeline === "function") return true;
    const stages: unknown = pipeline?.stages;
    return Array.isArray(stages) && stages.some((stage) => (stage as { use?: unknown } | null)?.use === "ota");
  }

  //? The whole app config, libs included: a target's `updates` may come from `native.updates` or its own section.
  async #loadNativeTargets(app: string): Promise<PipelineNativeTargets> {
    try {
      const targets = await resolveMobileTargets(AppExecutor.from(this.#workspace, app), "all");
      return { targets: targets.map(({ name, config }) => ({ name, updates: !!config.updates })) };
    } catch (error) {
      return { error: toError(error).message };
    }
  }

  async #loadWorkspace(): Promise<PipelineSourceFile<WorkspacePipelineConfig> | null> {
    const file = AkanWorkspaceConfig.fileName;
    const absolute = path.join(this.#workspace.workspaceRoot, file);
    if (!(await FileSys.fileExists(absolute))) return null;
    const sha256 = await PipelineDefinition.#sha256(absolute);
    try {
      return { file, sha256, pipeline: (await this.#workspace.getConfig()).pipeline };
    } catch (error) {
      this.#failed(file, error);
      return { file, sha256, pipeline: null };
    }
  }

  async #loadApp(app: string): Promise<PipelineSourceFile<AppPipelineConfig>> {
    const executor = AppExecutor.from(this.#workspace, app);
    const file = `apps/${app}/akan.config.ts`;
    const sha256 = await PipelineDefinition.#sha256(path.join(executor.cwdPath, "akan.config.ts"));
    try {
      const module = await AkanAppConfig.importConfigModule(executor.cwdPath);
      const config = typeof module === "function" ? (module as (app: AppExecutor) => unknown)(executor) : module;
      const pipeline =
        typeof config === "object" && config !== null ? (config as { pipeline?: AppPipelineConfig }).pipeline : null;
      return { file, sha256, pipeline: pipeline ?? null };
    } catch (error) {
      this.#failed(file, error);
      return { file, sha256, pipeline: null };
    }
  }

  #failed(file: string, error: unknown) {
    this.diagnostics.push({
      severity: "error",
      code: "pipeline.load.failed",
      message: `could not load: ${toError(error).message}`,
      file,
      path: null,
    });
  }

  static async #sha256(file: string) {
    return new Bun.CryptoHasher("sha256").update(await readFile(file)).digest("hex");
  }
}
