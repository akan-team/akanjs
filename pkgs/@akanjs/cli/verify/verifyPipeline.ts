import { existsSync } from "node:fs";
import path from "node:path";
import { ApplicationBuildReporter } from "@akanjs/devkit/applicationBuildReporter";
import type { Workspace } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor, PkgExecutor } from "@akanjs/devkit/executors";
import { Linter, parseBiomeReport } from "@akanjs/devkit/linter";
import { AkanQualityScanner } from "@akanjs/devkit/qualityScanner";
import { ProjectTypecheck } from "@akanjs/devkit/typecheck/projectTypecheck";
import { TypecheckFailure } from "@akanjs/devkit/typecheck/typecheckFailure";
import type { ApplicationRunner } from "../application/application.runner";
import { WorkspaceRunner } from "../workspace/workspace.runner";
import { VerifyComments } from "./verifyComments";
import { type VerifyDiagnostic, VerifyDiagnostics, type VerifyStepName } from "./verifyDiagnostics";
import { VerifyPrivateMethods } from "./verifyPrivateMethods";
import type { VerifyResult, VerifyStepResult } from "./verifyReport";
import type { VerifyScope, VerifyTarget } from "./verifyScope";
import { VerifyStyleClasses } from "./verifyStyleClasses";

export interface VerifyPipelineOptions {
  lintOnly?: boolean;
  build?: boolean;
}

interface StepOutcome {
  diagnostics: VerifyDiagnostic[];
  fixed?: number;
}

export class VerifyPipeline {
  readonly #workspace: Workspace;
  readonly #workspaceRunner: WorkspaceRunner;
  readonly #applicationRunner: ApplicationRunner;
  readonly #steps = new Map<VerifyStepName, VerifyStepResult>();
  readonly #diagnostics: VerifyDiagnostic[] = [];

  constructor(workspace: Workspace, workspaceRunner: WorkspaceRunner, applicationRunner: ApplicationRunner) {
    this.#workspace = workspace;
    this.#workspaceRunner = workspaceRunner;
    this.#applicationRunner = applicationRunner;
  }

  get #root() {
    return this.#workspace.workspaceRoot;
  }

  async run(scope: VerifyScope, { lintOnly = false, build = true }: VerifyPipelineOptions = {}): Promise<VerifyResult> {
    const startedAt = performance.now();
    const systems = scope.targets.filter((target) => target.type !== "pkg");
    if (!lintOnly) await this.#each("sync", systems, (target) => this.#sync(target));
    const synced = !this.#failed("sync");
    //? Before typecheck starts, so it reads the renamed files: a rename can clash with an inherited member.
    const renames = new Map<VerifyTarget, Map<string, string>>();
    for (const target of systems)
      renames.set(
        target,
        await VerifyPrivateMethods.fix(this.#root, target.dir, target.files).catch(() => new Map<string, string>()),
      );
    await Promise.all([
      this.#each("lint", scope.targets, (target) =>
        this.#lint(target, { comments: !lintOnly, rewritten: renames.get(target) ?? new Map<string, string>() }),
      ),
      lintOnly || !synced ? null : this.#each("typecheck", scope.targets, (target) => this.#typecheck(target)),
    ]);
    const apps = scope.targets.filter((target) => target.type === "app");
    const clean = !this.#diagnostics.some((diagnostic) => diagnostic.severity === "error");
    if (!lintOnly && build && apps.length) {
      if (clean) await this.#each("build", apps, (target) => this.#build(target));
      else this.#skip("build");
    }
    if (!lintOnly && scope.touchesTsx) await this.#each("ssr", [null], () => this.#ssr(scope));
    return {
      ok: !this.#diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      targets: scope.targets.map((target) => target.name),
      ms: Math.round(performance.now() - startedAt),
      steps: [...this.#steps.values()],
      diagnostics: this.#diagnostics,
    };
  }

  async #each<T>(name: VerifyStepName, items: T[], step: (item: T) => Promise<StepOutcome>) {
    if (!items.length) return;
    const startedAt = performance.now();
    let fixed = 0;
    let failed = false;
    for (const item of items) {
      const outcome = await step(item).catch(
        (error: unknown): StepOutcome => ({
          diagnostics: [VerifyDiagnostics.fromMessage(name, ApplicationBuildReporter.formatError(error, this.#root))],
        }),
      );
      fixed += outcome.fixed ?? 0;
      failed ||= outcome.diagnostics.some((diagnostic) => diagnostic.severity === "error");
      this.#diagnostics.push(...outcome.diagnostics);
    }
    const ms = Math.round(performance.now() - startedAt);
    this.#steps.set(name, { name, status: failed ? "fail" : "pass", ms, fixed });
  }

  #skip(name: VerifyStepName) {
    this.#steps.set(name, { name, status: "skip", ms: 0, fixed: 0 });
  }

  #failed(name: VerifyStepName) {
    return this.#steps.get(name)?.status === "fail";
  }

  async #sync(target: VerifyTarget): Promise<StepOutcome> {
    if (target.type === "app") await AppExecutor.from(this.#workspace, target.name).scanSync();
    else await LibExecutor.from(this.#workspace, target.name).scan();
    return { diagnostics: [] };
  }

  async #lint(
    target: VerifyTarget,
    { comments, rewritten }: { comments: boolean; rewritten: Map<string, string> },
  ): Promise<StepOutcome> {
    const files = target.files.length
      ? target.files.filter((file) => existsSync(path.join(this.#root, file)))
      : [target.dir];
    const biome = files.length
      ? await this.#biome(files, VerifyPipeline.#cssDirsOf(target))
      : { diagnostics: [], fixed: 0 };
    const formattedAfter = await this.#changedSince(rewritten);
    const exec = this.#execOf(target);
    const gates = await this.#workspaceRunner.lintGateFailures(exec, true);
    const added = comments && target.files.length ? await VerifyComments.added(this.#root, target.files) : [];
    return {
      diagnostics: [
        ...biome.diagnostics,
        ...added,
        ...gates.messages.map((message) => VerifyDiagnostics.fromMessage("lint", message, "akan.lint")),
        ...VerifyDiagnostics.fromMaintainability(gates.maintainability),
      ],
      fixed: (biome.fixed ?? 0) + rewritten.size - formattedAfter,
    };
  }

  static #cssDirsOf(target: VerifyTarget) {
    if (target.type === "pkg") return [];
    return target.type === "app" ? [target.dir, "libs"] : ["libs"];
  }

  //? Biome counts the files it changed, so a renamed file it also reformatted is one file fixed, not two.
  async #changedSince(rewritten: Map<string, string>) {
    let changed = 0;
    for (const [file, text] of rewritten)
      if ((await Bun.file(path.join(this.#root, file)).text()) !== text) changed += 1;
    return changed;
  }

  async #biome(files: string[], cssDirs: string[]): Promise<StepOutcome> {
    const configPath = await WorkspaceRunner.resolveBiomeConfigPath(this.#workspace);
    const [biome, ...biomeArgs] = Linter.biomeCommand(this.#root);
    const proc = Bun.spawn(
      [
        biome,
        ...biomeArgs,
        "check",
        "--write",
        "--reporter=json",
        "--max-diagnostics=none",
        "--no-errors-on-unmatched",
        ...(configPath ? ["--config-path", configPath] : []),
        ...files,
      ],
      { cwd: this.#root, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    try {
      const report = parseBiomeReport(stdout);
      const diagnostics = await VerifyStyleClasses.dropDefined(this.#root, report.diagnostics ?? [], cssDirs);
      return {
        diagnostics: VerifyDiagnostics.fromBiome({ ...report, diagnostics }, this.#root),
        fixed: report.summary?.changed ?? 0,
      };
    } catch {
      return { diagnostics: [VerifyDiagnostics.fromMessage("lint", (stderr || stdout).trim(), "biome")] };
    }
  }

  async #typecheck(target: VerifyTarget): Promise<StepOutcome> {
    try {
      if (target.type === "app")
        await this.#applicationRunner.typecheck(AppExecutor.from(this.#workspace, target.name), {
          tests: true,
          report: "records",
        });
      else if (target.type === "lib")
        await this.#applicationRunner.typecheckLibrary(LibExecutor.from(this.#workspace, target.name), {
          tests: true,
          report: "records",
        });
      else {
        const tsconfigPath = path.join(this.#root, target.dir, "tsconfig.json");
        if (!existsSync(tsconfigPath)) return { diagnostics: [] };
        await new ProjectTypecheck(path.join(this.#root, target.dir), this.#root, process.env).check(
          tsconfigPath,
          "records",
        );
      }
      return { diagnostics: [] };
    } catch (error) {
      if (error instanceof TypecheckFailure) return { diagnostics: VerifyDiagnostics.fromTypecheck(error.records) };
      throw error;
    }
  }

  async #build(target: VerifyTarget): Promise<StepOutcome> {
    //? `fast` drops the build's own typecheck phase; the typecheck step above has already run it.
    const { routeJsWarnings = [] } = await this.#applicationRunner.build(
      AppExecutor.from(this.#workspace, target.name),
      { fast: true },
    );
    return { diagnostics: routeJsWarnings.map((warning) => VerifyDiagnostics.fromRouteJsBudget(warning)) };
  }

  async #ssr(scope: VerifyScope): Promise<StepOutcome> {
    const scanned = await new AkanQualityScanner().scan(this.#root);
    const warnings = scanned.warnings.filter((warning) => warning.scope === "ssr");
    return { diagnostics: VerifyDiagnostics.fromQuality(warnings, scope.changedFiles) };
  }

  #execOf(target: VerifyTarget) {
    if (target.type === "app") return AppExecutor.from(this.#workspace, target.name);
    if (target.type === "lib") return LibExecutor.from(this.#workspace, target.name);
    return PkgExecutor.from(this.#workspace, target.name);
  }
}
