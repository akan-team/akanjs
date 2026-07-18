import { CommandContainer, createWorkflowStepRegistry, type Workspace } from "@akanjs/devkit";
import { ModuleScript } from "../module/module.script";
import { PrimitiveScript } from "../primitive/primitive.script";
import { ScalarScript } from "../scalar/scalar.script";

export const createCliWorkflowStepRegistry = (workspace: Workspace) =>
  createWorkflowStepRegistry({
    workspace,
    createModule: (sys, module) => CommandContainer.get(ModuleScript).createModuleTemplate(sys, module),
    createScalar: (sys, scalar) => CommandContainer.get(ScalarScript).createScalar(sys, scalar),
    createUi: (input) => CommandContainer.get(PrimitiveScript).createUi(workspace, input),
    addField: (input) => CommandContainer.get(PrimitiveScript).addField(workspace, input),
    addEnumField: (input) => CommandContainer.get(PrimitiveScript).addEnumField(workspace, input),
    addMutation: (input) => CommandContainer.get(PrimitiveScript).addMutation(workspace, input),
    addSlice: (input) => CommandContainer.get(PrimitiveScript).addSlice(workspace, input),
  });
