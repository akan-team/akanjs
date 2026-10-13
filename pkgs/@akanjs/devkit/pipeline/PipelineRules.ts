import type {
  PipelineActionName,
  PipelineMilestone,
  PipelineOtaPlatform,
  PipelinePlanRetry,
  PipelineTrigger,
} from "akanjs/common";

export interface PipelineWhenRule {
  branch: string[] | null;
  trigger: PipelineTrigger[] | null;
  changed: string[] | null;
  /** A workspace `matrix: "apps"` stage's narrowing; never set elsewhere. */
  app: string[] | null;
}

export interface PipelineStepRule {
  localId: string;
  name: string;
  timeoutSeconds: number | null;
  retry: PipelinePlanRetry | null;
  allowFailure: boolean;
  run: string;
  cwd: string;
  /** The stage's env under the step's own. */
  env: Record<string, string>;
  secrets: string[];
  skipExitCodes: number[];
}

interface PipelineStageRuleBase {
  id: string;
  name: string;
  description: string | null;
  milestone: PipelineMilestone | null;
  when: PipelineWhenRule;
  timeoutSeconds: number | null;
  allowFailure: boolean;
  path: string;
}

export interface PipelineShellStageRule extends PipelineStageRuleBase {
  kind: "sh";
  steps: PipelineStepRule[];
}

export interface PipelineActionStageRule extends PipelineStageRuleBase {
  kind: "action";
  action: PipelineActionName;
  named: boolean;
  retry: PipelinePlanRetry | null;
  /** `ota` only; `null` takes the default. */
  targets: string[] | null;
  platforms: PipelineOtaPlatform[] | null;
}

export interface PipelineParallelStageRule extends PipelineStageRuleBase {
  kind: "parallel";
  maxParallel: number | null;
  failFast: boolean;
  branches: PipelineShellStageRule[];
}

export interface PipelineMatrixStageRule extends PipelineStageRuleBase {
  kind: "matrix";
  maxParallel: number | null;
  steps: PipelineStepRule[];
}

export type PipelineWorkspaceStageRule = PipelineShellStageRule | PipelineParallelStageRule | PipelineMatrixStageRule;
export type PipelineAppStageRule = PipelineShellStageRule | PipelineActionStageRule;

export interface PipelinePostRule {
  success: PipelineStepRule[];
  failure: PipelineStepRule[];
  canceled: PipelineStepRule[];
  always: PipelineStepRule[];
}

export interface PipelineWorkspaceRule {
  env: Record<string, string>;
  timeoutSeconds: number | null;
  before: PipelineWorkspaceStageRule[];
  after: PipelineWorkspaceStageRule[];
  post: PipelinePostRule;
}

export interface PipelineAppRule {
  env: Record<string, string>;
  after: string[];
  stages: PipelineAppStageRule[];
}
