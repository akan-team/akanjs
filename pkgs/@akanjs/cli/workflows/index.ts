import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { addEnumFieldWorkflowSpec } from "./addEnumField";
import { addFieldWorkflowSpec } from "./addField";
import { addMutationWorkflowSpec } from "./addMutation";
import { addSliceWorkflowSpec } from "./addSlice";
import { createModuleWorkflowSpec } from "./createModule";
import { createScalarWorkflowSpec } from "./createScalar";
import { createUiWorkflowSpec } from "./createUi";

export const workflowSpecs: readonly WorkflowSpec[] = [
  createModuleWorkflowSpec,
  createScalarWorkflowSpec,
  createUiWorkflowSpec,
  addFieldWorkflowSpec,
  addEnumFieldWorkflowSpec,
  addMutationWorkflowSpec,
  addSliceWorkflowSpec,
];
