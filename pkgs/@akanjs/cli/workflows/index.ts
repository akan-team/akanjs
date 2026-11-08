import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { addEnumFieldWorkflowSpec } from "./addEnumField";
import { addFieldWorkflowSpec } from "./addField";
import { addMutationWorkflowSpec } from "./addMutation";
import { addSliceWorkflowSpec } from "./addSlice";
import { createInteractionWorkflowSpec } from "./createInteraction";
import { createModuleWorkflowSpec } from "./createModule";
import { createScalarWorkflowSpec } from "./createScalar";
import { createUiWorkflowSpec } from "./createUi";
import { renameKeyWorkflowSpec } from "./renameKey";

export const workflowSpecs: readonly WorkflowSpec[] = [
  createModuleWorkflowSpec,
  createScalarWorkflowSpec,
  createUiWorkflowSpec,
  createInteractionWorkflowSpec,
  addFieldWorkflowSpec,
  addEnumFieldWorkflowSpec,
  addMutationWorkflowSpec,
  addSliceWorkflowSpec,
  renameKeyWorkflowSpec,
];
