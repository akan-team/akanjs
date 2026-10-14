// A plan is computed inside the tenant's build pod and run by an executor outside it, so this file is the whole
// contract between them: the executor parses every plan with `PipelinePlanSchema` before trusting any of it.

export const pipelinePlanVersion = 1;

/** Fixed vocabulary so a non-developer UI can label, order and translate progress without reading stage names. */
export const pipelineMilestones = ["prepare", "build", "verify", "package", "deploy", "finish"] as const;
export type PipelineMilestone = (typeof pipelineMilestones)[number];

/**
 * What started the build, in the executor's terms: a webhook push, the redeploy button, a project's first build, a
 * rebuild of a finished build, and `manual` for an admin build-and-deploy or a studio publish (also the local CLI's
 * default).
 */
export const pipelineTriggers = ["push", "redeploy", "initial", "rebuild", "manual"] as const;
export type PipelineTrigger = (typeof pipelineTriggers)[number];

/**
 * The executor's own operations, declared per app. Within one app each appears at most once, in this order, and
 * `docker` needs a `build` before it: the image is made from this run's `akan build` output. An action whose app's
 * previous action in the run was skipped or did not succeed is skipped, never run. `deploy` is the only way any part
 * of a plan reaches the master host, and its phase runs the apps one at a time. `ota` packs an over-the-air update of
 * the app's native web bundle per target and platform (`akan pack-update`) for the executor to sign and publish; it
 * makes its own CSR build, so it needs no `build` before it.
 */
export const pipelineActions = {
  build: { version: 1, milestone: "build", name: "Build" },
  docker: { version: 1, milestone: "package", name: "Docker" },
  deploy: { version: 1, milestone: "deploy", name: "Deploy" },
  ota: { version: 1, milestone: "deploy", name: "OTA" },
} as const satisfies Record<string, { version: number; milestone: PipelineMilestone; name: string }>;
export type PipelineActionName = keyof typeof pipelineActions;
export const pipelineActionNames = Object.keys(pipelineActions) as readonly PipelineActionName[];

/** The phones an `ota` action packs for; a desktop app updates itself whole, outside a pipeline. */
export const pipelineOtaPlatforms = ["ios", "android"] as const;
export type PipelineOtaPlatform = (typeof pipelineOtaPlatforms)[number];

/**
 * Where a phase came from. Workspace `before`/`after` stages become a phase each; app stages fill the slots around the
 * three action phases, the k-th custom stage of every app in a slot sharing one phase (`after-build`, `after-build-2`…).
 */
export const pipelinePlanSlots = [
  "before",
  "before-build",
  "build",
  "after-build",
  "docker",
  "after-docker",
  "deploy",
  "after-deploy",
  "ota",
  "after-ota",
  "after",
] as const;
export type PipelinePlanSlot = (typeof pipelinePlanSlots)[number];

/**
 * Set by the executor on every `sh` step (AKAN_CI_APP from the stage's `app`), never by a plan. AKAN_CI_RESULT's
 * values are the executor's.
 */
export const pipelineRuntimeEnv = [
  "CI",
  "AKAN_CI",
  "AKAN_CI_BRANCH",
  "AKAN_CI_ENV",
  "AKAN_CI_TRIGGER",
  "AKAN_CI_BUILD_NUM",
  "AKAN_CI_COMMIT",
  "AKAN_CI_APPS",
  "AKAN_CI_APP",
  "AKAN_CI_PHASE",
  "AKAN_CI_STAGE",
  "AKAN_CI_STEP",
  "AKAN_CI_RESULT",
] as const;

/**
 * Names neither an `env` key nor a secret may take, besides every `AKAN_CI_*`: the executor exports a step's env before
 * it runs `timeout` and `bash`, so these would reach its own commands. A step's script may still set them itself.
 */
export const pipelineReservedEnv = [
  "CI",
  "AKAN_CI",
  "PATH",
  "HOME",
  "PWD",
  "SHELL",
  "IFS",
  "BASH_ENV",
  "ENV",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
] as const;

export const pipelinePlanLimits = {
  phases: 50,
  stages: 400,
  steps: 1000,
  shBytes: 64 * 1024,
  planBytes: 1024 * 1024,
  nameChars: 120,
  descriptionChars: 500,
  patternChars: 256,
  retryAttempts: 10,
  retryDelaySeconds: 3600,
} as const;

/** The planner's context flags echoed, never reordered or defaulted when given; `--apps` is split and trimmed. */
export interface PipelinePlanContext {
  branch: string;
  /** AKAN_PUBLIC_ENV the build is for; the executor passes the branch. */
  env: string;
  /** Apps this run builds, after the executor dropped unchanged ones; a duplicate or unknown app is an error. */
  apps: string[];
  trigger: PipelineTrigger;
  buildNum: number;
  commit: string | null;
}

/** A file the plan was composed from; `declared: false` means it carries no `pipeline` and its default applied. */
export interface PipelinePlanSource {
  file: string;
  sha256: string;
  declared: boolean;
}

/** A condition that came out false; the node stays in the plan so a UI can show it as skipped. */
export interface PipelineSkip {
  reason: string;
}

export interface PipelinePlanRetry {
  attempts: number;
  delaySeconds: number;
}

interface PipelinePlanStepBase {
  /** Stable across runs as long as the definition keeps its ids and names. */
  id: string;
  name: string;
  timeoutSeconds: number | null;
  /** `null`: the executor's default (1 attempt for `sh`, the action's own for an action). */
  retry: PipelinePlanRetry | null;
  allowFailure: boolean;
}

export interface PipelinePlanShellStep extends PipelinePlanStepBase {
  kind: "sh";
  /** Run by `bash -e -o pipefail` in the build pod, from `cwd` under the workspace root. */
  run: string;
  cwd: string;
  /** Effective env: workspace pipeline, then app pipeline, then stage, then step. */
  env: Record<string, string>;
  /** Names only. Values never pass through the planner. */
  secrets: string[];
  /** An exit code here ends the step `skipped` and skips the rest of its stage; that is not a failure. */
  skipExitCodes: number[];
}

interface PipelinePlanActionStepBase extends PipelinePlanStepBase {
  kind: "action";
  actionVersion: 1;
}

export interface PipelinePlanAppActionStep extends PipelinePlanActionStepBase {
  action: Exclude<PipelineActionName, "ota">;
  with: { app: string };
}

/** One pack per target and platform; each target is one that declares `native.updates`. */
export interface PipelinePlanOtaStep extends PipelinePlanActionStepBase {
  action: "ota";
  with: { app: string; targets: string[]; platforms: PipelineOtaPlatform[] };
}

export type PipelinePlanActionStep = PipelinePlanAppActionStep | PipelinePlanOtaStep;

export type PipelinePlanStep = PipelinePlanShellStep | PipelinePlanActionStep;

/**
 * Stages of one phase run concurrently unless the phase is sequential; a stage's steps run in order. Whether a stage
 * runs and what its failure means live here, not on the phase, because one phase holds stages of many apps.
 */
export interface PipelinePlanStage {
  id: string;
  name: string;
  description: string | null;
  /** The app whose `akan.config.ts` declared the stage, or the copy of a workspace `matrix: "apps"` stage. */
  app: string | null;
  milestone: PipelineMilestone;
  skip: PipelineSkip | null;
  /** Conditions only the executor can decide; `changed` is relative to the branch's newest successful build. */
  runtimeWhen: { changed: string[] } | null;
  /** The stage's failure does not fail the run; what the run's result becomes is the executor's to say. */
  allowFailure: boolean;
  timeoutSeconds: number | null;
  steps: PipelinePlanStep[];
}

/** Phases run in order and are barriers: the next starts once every stage of this one has settled. */
export interface PipelinePlanPhase {
  id: string;
  name: string;
  description: string | null;
  slot: PipelinePlanSlot;
  milestone: PipelineMilestone;
  action: PipelineActionName | null;
  /** `sequential` runs the stages one at a time in the listed order (`appOrder` for the deploy phase). */
  order: "parallel" | "sequential";
  maxParallel: number | null;
  failFast: boolean;
  /** A workspace `parallel`/`matrix` stage's budget over all of its stages. */
  timeoutSeconds: number | null;
  stages: PipelinePlanStage[];
}

/** Run in the build pod after the last phase, the result's list first and `always` last; best effort. */
export interface PipelinePlanPost {
  success: PipelinePlanShellStep[];
  failure: PipelinePlanShellStep[];
  canceled: PipelinePlanShellStep[];
  always: PipelinePlanShellStep[];
}

/** Bootstrap (checkout, env, install, plan) and cleanup belong to the executor and are not in a plan. */
export interface PipelinePlan {
  schemaVersion: 1;
  sources: { workspace: PipelinePlanSource | null; apps: Record<string, PipelinePlanSource> };
  planner: { akanVersion: string };
  context: PipelinePlanContext;
  /** `context.apps` ordered by each app's `after`, ties kept in the given order. */
  appOrder: string[];
  timeoutSeconds: number | null;
  requiredSecrets: string[];
  phases: PipelinePlanPhase[];
  post: PipelinePlanPost;
}

export interface PipelineDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** The file and where in it, e.g. `apps/api/akan.config.ts` · `pipeline.stages[2].sh`. */
  file: string | null;
  path: string | null;
}

/** What `akan pipeline plan --out <file>` always writes, success or not. */
export type PipelinePlanResult =
  | { ok: true; plan: PipelinePlan; diagnostics: PipelineDiagnostic[] }
  | { ok: false; plan: null; diagnostics: PipelineDiagnostic[] };
