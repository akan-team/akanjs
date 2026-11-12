import type { Workspace } from "../commandDecorators";
import type {
  AkanContextEvidence,
  AkanContextNext,
  InspectAkanContextProps,
  InspectAkanContextRequest,
  InspectAkanContextResult,
  WorkflowDiagnostic,
} from "../workflow";
import { buildAkanModuleContextIndex, createWorkflowBaselineSummary } from "../workflow";
import { AkanContextAnalyzer, type AkanDiagnostic, type AkanModuleContext } from "./akanContext";

type InspectRequestOf<Type extends InspectAkanContextRequest["type"]> = Extract<
  InspectAkanContextRequest,
  { type: Type }
>;

export const inspectDiagnostic = (
  severity: WorkflowDiagnostic["severity"],
  code: string,
  message: string,
): WorkflowDiagnostic => ({ severity, code, message });

export const moduleEvidence = (module: AkanModuleContext): AkanContextEvidence => ({
  kind: "module",
  target: `${module.sysName}:${module.name}`,
  path: module.path,
  summary: `${module.kind} module at ${module.path} with ${module.files.length} source file(s).`,
});

export const moduleCandidate = (module: AkanModuleContext) => ({
  app: module.sysName,
  sysType: module.sysType,
  module: module.name,
  kind: module.kind,
  path: module.path,
  files: module.files,
});

export class AkanContextInspection {
  readonly #workspace: Workspace;
  readonly #question: string;
  readonly #diagnostics: WorkflowDiagnostic[] = [];

  constructor(workspace: Workspace, props: InspectAkanContextProps) {
    this.#workspace = workspace;
    this.#question = props.question;
    if (props.draft.type !== props.request.type) {
      this.#diagnostics.push(
        inspectDiagnostic(
          "warning",
          "inspect-draft-request-mismatch",
          `Draft chose ${props.draft.type}, but request uses ${props.request.type}.`,
        ),
      );
    }
  }

  escape(request: InspectRequestOf<"escape">) {
    return this.#result(
      "escape",
      [{ kind: "escape", summary: request.reason }],
      {
        action: "escape",
        reason: request.reason,
        ...(request.nextStep ? { args: { nextStep: request.nextStep } } : {}),
      },
      { reason: request.reason, nextStep: request.nextStep ?? null },
    );
  }

  async workflowDiagnostics(request: InspectRequestOf<"workflowDiagnostics">, artifactPath: string) {
    const doctor = await AkanContextAnalyzer.doctor(this.#workspace, {
      strict: true,
      runIdOrPlan: artifactPath,
    });
    const toWorkflowDiagnostic = (
      { severity, code, message, scope }: AkanDiagnostic,
      context: AkanDiagnostic["context"],
    ): WorkflowDiagnostic => ({ severity, code, message, scope, context });
    const baselineSummary = createWorkflowBaselineSummary(
      (doctor.baselineDiagnostics ?? []).map((diagnostic) => toWorkflowDiagnostic(diagnostic, diagnostic.context)),
      { detailsIncluded: false },
    );
    this.#diagnostics.push(
      ...(doctor.workflowDiagnostics ?? doctor.diagnostics).map((diagnostic) =>
        toWorkflowDiagnostic(diagnostic, {
          ...diagnostic.context,
          ...(diagnostic.path ? { paths: [diagnostic.path] } : {}),
        }),
      ),
    );
    return this.#result(
      "workflowDiagnostics",
      [
        {
          kind: "workflow",
          target: request.runIdOrPlan,
          summary: `Workflow diagnostics status is ${doctor.status}.`,
        },
      ],
      {
        action: doctor.status === "passed" ? "answer" : "validate",
        reason:
          doctor.status === "passed"
            ? "No strict workspace diagnostics were found for the workflow context."
            : "Review diagnostics before applying or manually editing source files.",
      },
      {
        status: doctor.status,
        baselineSummary,
        baselineDiagnostics: 0,
        workflowDiagnostics: doctor.workflowDiagnostics?.length ?? 0,
      },
    );
  }

  async workspaceOverview() {
    const context = await AkanContextAnalyzer.analyze(this.#workspace, {
      app: null,
      module: null,
      includeAbstractContent: false,
    });
    return this.#result(
      "workspaceOverview",
      [
        {
          kind: "workspace",
          summary: `${context.repoName} has ${context.apps.length} app(s), ${context.libs.length} lib(s), and ${context.pkgs.length} package(s).`,
        },
      ],
      {
        action: "inspect",
        reason: "Choose moduleContext or fieldInsertionContext for module-scoped evidence before planning a workflow.",
        tool: "inspect_akan_context",
      },
      {
        repoName: context.repoName,
        apps: context.apps.map((app) => ({ name: app.name, path: app.path, modules: app.modules.length })),
        libs: context.libs.map((lib) => ({ name: lib.name, path: lib.path, modules: lib.modules.length })),
        pkgs: context.pkgs.map((pkg) => ({ name: pkg.name, path: pkg.path, version: pkg.version ?? null })),
        generatedFiles: context.generatedFiles,
        validationCommands: context.validationCommands,
      },
    );
  }

  async moduleContext(request: InspectRequestOf<"moduleContext">) {
    const modules = await this.#matchingModules(request);
    const unresolved = this.#unresolvedModule(request, modules);
    if (unresolved) return unresolved;
    const module = modules[0];
    return this.#result(
      "moduleContext",
      [moduleEvidence(module)],
      {
        action: "inspect",
        reason: "Use fieldInsertionContext when preparing add-field or escape when source body details are required.",
        tool: "inspect_akan_context",
      },
      { module: moduleCandidate(module) },
    );
  }

  async fieldInsertionContext(request: InspectRequestOf<"fieldInsertionContext">) {
    const modules = await this.#matchingModules(request);
    const unresolved = this.#unresolvedModule(request, modules);
    if (unresolved) return unresolved;
    const module = modules[0];
    if (module.kind !== "domain") {
      this.#diagnostics.push(
        inspectDiagnostic(
          "error",
          "field-insertion-unsupported-module-kind",
          `fieldInsertionContext currently targets domain modules; ${module.sysName}:${module.name} is ${module.kind}.`,
        ),
      );
    }
    const moduleIndex = await buildAkanModuleContextIndex(this.#workspace, module, { field: request.field });
    this.#diagnostics.push(...moduleIndex.diagnostics);
    return this.#result(
      "fieldInsertionContext",
      [
        moduleEvidence(module),
        {
          kind: "field-insertion",
          target: `${module.sysName}:${module.name}.${request.field}`,
          path: module.path,
          summary:
            "M2 returns source-body-free AST index evidence for constant fields, dictionary model labels, and light projection fields.",
        },
      ],
      module.kind === "domain"
        ? {
            action: "plan_workflow",
            reason: "The module target is unambiguous; create an add-field workflow plan before source edits.",
            tool: "plan_workflow",
            args: {
              workflow: "add-field",
              inputs: {
                app: module.sysName,
                module: module.name,
                field: request.field,
                type: request.fieldType,
              },
            },
          }
        : {
            action: "escape",
            reason: "This module kind is not a supported add-field target in the P1 context contract.",
          },
      {
        target: {
          app: module.sysName,
          module: module.name,
          field: request.field,
          fieldType: request.fieldType,
        },
        files: moduleIndex.files,
        moduleIndex,
      },
    );
  }

  async #matchingModules(request: InspectRequestOf<"moduleContext" | "fieldInsertionContext">) {
    const context = await AkanContextAnalyzer.analyze(this.#workspace, {
      app: request.app ?? null,
      module: request.module ?? null,
      includeAbstractContent: false,
    });
    return AkanContextAnalyzer.findModules(context, request.module, {
      app: request.app ?? null,
    });
  }

  #unresolvedModule(
    request: InspectRequestOf<"moduleContext" | "fieldInsertionContext">,
    modules: AkanModuleContext[],
  ): InspectAkanContextResult | null {
    if (modules.length === 0) {
      this.#diagnostics.push(
        inspectDiagnostic(
          "error",
          "inspect-module-not-found",
          `No module matched ${request.app ? `${request.app}:` : ""}${request.module}.`,
        ),
      );
      return this.#result(
        request.type,
        [],
        {
          action: "escape",
          reason:
            "The requested module was not found in the workspace index; inspect workspace files or clarify the target.",
        },
        { candidates: [] },
      );
    }
    if (!request.app && modules.length > 1) {
      this.#diagnostics.push(
        inspectDiagnostic(
          "error",
          "inspect-module-ambiguous",
          `Multiple modules match "${request.module}". Re-run with app to disambiguate.`,
        ),
      );
      return this.#result(
        request.type,
        modules.map(moduleEvidence),
        {
          action: "clarify",
          reason: "Multiple modules have the same name; choose an app before planning a workflow.",
        },
        { candidates: modules.map(moduleCandidate) },
      );
    }
    return null;
  }

  #result(
    type: InspectAkanContextRequest["type"],
    evidence: AkanContextEvidence[],
    next: AkanContextNext,
    data?: Record<string, unknown>,
  ): InspectAkanContextResult {
    return {
      schemaVersion: 1,
      type,
      question: this.#question,
      diagnostics: this.#diagnostics,
      evidence,
      next,
      ...(data ? { data } : {}),
    };
  }
}
