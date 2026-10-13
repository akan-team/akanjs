import type {
  PipelineActionName,
  PipelineMilestone,
  PipelineOtaPlatform,
  PipelinePlanContext,
  PipelineTrigger,
} from "akanjs/common";

export type PipelineDuration = number | `${number}s` | `${number}m` | `${number}h`;

/** In the `PipelinePattern` dialect of `akanjs/common`; a leading `!` excludes. */
export type PipelineGlob = string | readonly string[];

/** Every key given must hold. `branch` and `trigger` are decided by the planner, `changed` by the executor. */
export interface PipelineWhen {
  branch?: PipelineGlob;
  trigger?: PipelineTrigger | readonly PipelineTrigger[];
  /** Paths changed since the branch's newest successful build; an unknown baseline counts as changed. */
  changed?: PipelineGlob;
}

export interface PipelineStepInput {
  sh: string;
  id?: string;
  name?: string;
  /** Relative to the workspace root, never above it. */
  cwd?: string;
  env?: Record<string, string>;
  secrets?: readonly string[];
  timeout?: PipelineDuration;
  /** Total attempts. */
  retry?: number | { attempts: number; delay?: PipelineDuration };
  allowFailure?: boolean;
  skipExitCodes?: readonly number[];
}

export type PipelineStepLike = string | PipelineStepInput;

/** `timeout` and `allowFailure` cover the whole stage, every parallel branch and per-app copy included. */
export interface PipelineStageBase {
  id?: string;
  description?: string;
  milestone?: PipelineMilestone;
  when?: PipelineWhen;
  timeout?: PipelineDuration;
  allowFailure?: boolean;
}

export interface PipelineShellStageInput extends PipelineStageBase {
  name: string;
  /** Exactly one of `sh` and `steps`. */
  sh?: string;
  steps?: readonly PipelineStepLike[];
  env?: Record<string, string>;
  secrets?: readonly string[];
  /** For each step that names no `retry` of its own. */
  retry?: PipelineStepInput["retry"];
  use?: never;
  parallel?: never;
  matrix?: never;
}

/** No action parameters yet: rollout wait and prepull stay the executor's settings. */
export interface PipelineActionStageInput extends PipelineStageBase {
  use: Exclude<PipelineActionName, "ota">;
  name?: string;
  retry?: number;
  targets?: never;
  platforms?: never;
  sh?: never;
  steps?: never;
  parallel?: never;
  matrix?: never;
}

/**
 * An over-the-air update of the app's native web bundle, packed per target and platform for the executor to sign and
 * publish. Every target named must declare `native.updates`.
 */
export interface PipelineOtaStageInput extends PipelineStageBase {
  use: "ota";
  name?: string;
  retry?: number;
  /** Default: every native target that declares `native.updates`. */
  targets?: readonly string[];
  /** Default: both. */
  platforms?: readonly PipelineOtaPlatform[];
  sh?: never;
  steps?: never;
  parallel?: never;
  matrix?: never;
}

export type AppPipelineStageInput = PipelineActionStageInput | PipelineOtaStageInput | PipelineShellStageInput;

export interface AppPipelineInput {
  schemaVersion?: 1;
  /** This app's stages in order, the actions it takes included. */
  stages: readonly AppPipelineStageInput[];
  env?: Record<string, string>;
  /** Apps whose turn comes before this one's where apps run one at a time (deploy). Apps not in the run are ignored. */
  after?: readonly string[];
}

export interface PipelineContext extends Readonly<Omit<PipelinePlanContext, "apps">> {
  readonly apps: readonly string[];
  /** Every app in this checkout: a subspace sees its slice only. */
  readonly workspaceApps: readonly string[];
}

export interface AppPipelineContext extends PipelineContext {
  readonly app: string;
}

/** Read by `akan pipeline` alone: the app config loader drops it, so it never reaches `akan.app.json`. */
export type AppPipelineConfig = AppPipelineInput | ((ctx: AppPipelineContext) => AppPipelineInput);

/** What an app without a `pipeline` runs. */
export const defaultAppPipeline = {
  stages: [{ use: "build" }, { use: "docker" }, { use: "deploy" }],
} as const satisfies AppPipelineInput;

/** One copy per app of the run, each with AKAN_CI_APP; `when.app` narrows the apps. */
export interface PipelineMatrixStageInput extends Omit<PipelineShellStageInput, "matrix" | "when"> {
  matrix: "apps";
  maxParallel?: number;
  when?: PipelineWhen & { app?: PipelineGlob };
}

export interface PipelineParallelStageInput extends PipelineStageBase {
  name: string;
  parallel: readonly PipelineShellStageInput[];
  maxParallel?: number;
  failFast?: boolean;
  env?: Record<string, string>;
  secrets?: readonly string[];
  use?: never;
  sh?: never;
  steps?: never;
  matrix?: never;
}

export type WorkspacePipelineStageInput =
  | PipelineShellStageInput
  | PipelineMatrixStageInput
  | PipelineParallelStageInput;

export interface PipelinePostInput {
  success?: readonly PipelineStepLike[];
  failure?: readonly PipelineStepLike[];
  canceled?: readonly PipelineStepLike[];
  always?: readonly PipelineStepLike[];
}

export interface WorkspacePipelineInput {
  schemaVersion?: 1;
  /** For every step of the run, app stages included. */
  env?: Record<string, string>;
  timeout?: PipelineDuration;
  /** Before any app stage. */
  before?: readonly WorkspacePipelineStageInput[];
  /** After every app's last stage. */
  after?: readonly WorkspacePipelineStageInput[];
  post?: PipelinePostInput;
}

export type WorkspacePipelineConfig = WorkspacePipelineInput | ((ctx: PipelineContext) => WorkspacePipelineInput);
