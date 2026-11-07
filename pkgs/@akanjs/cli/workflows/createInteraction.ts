import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { baseValidation, inspectSystemStep, syncGeneratedStep, sysInputs, validateTarget } from "./shared";

export const createInteractionWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "create-interaction",
  description:
    "Plan a client interaction as a webkit hook over a pure, tested common/ class, so a component holds markup and not the logic behind it.",
  whenToUse:
    "Use when a Zone, Util, or Template grows event handling, keyboard or pointer logic, or layout math, or reaches into the store for it: move it into the hook and the pure class instead.",
  inputs: {
    ...sysInputs,
    interaction: {
      type: "string",
      required: true,
      description: "Interaction name in camelCase (boardKeys): webkit/useBoardKeys.tsx over common/boardKeys.ts.",
    },
  },
  optionalSurfaces: {
    webkit: "include",
    common: "include",
    zone: "infer",
    util: "infer",
  },
  steps: [
    inspectSystemStep("Read the target's webkit and common layers."),
    {
      id: "create-interaction",
      title: "Create interaction",
      tool: "createInteraction",
      description: "Create the use<X> hook, the pure <X> class, and its colocated test.",
    },
    syncGeneratedStep("Refresh the webkit and common barrels."),
    validateTarget,
  ],
  predictedChanges: [
    {
      target: "*/common/<interaction>.ts",
      action: "create",
      applyScope: "auto",
      reason: "Pure, isomorphic interaction logic.",
    },
    {
      target: "*/common/<interaction>.test.ts",
      action: "create",
      applyScope: "auto",
      reason: "Colocated test of the pure logic.",
    },
    {
      target: "*/webkit/use<Interaction>.tsx",
      action: "create",
      applyScope: "auto",
      reason: '"use client" hook returning a named object of closures.',
    },
    { target: "*/common/index.ts", action: "sync", reason: "Generated common barrel exports the new class." },
    { target: "*/webkit/index.ts", action: "sync", reason: "Generated webkit barrel exports the new hook." },
  ],
  validation: [
    ...baseValidation,
    { command: "akan test <app-or-lib>", reason: "Run the pure logic's colocated test.", kind: "custom" },
  ],
  completionCriteria: [
    "Decisions live in the common/ class and are covered by its test.",
    "The hook wires events and the store, and returns a named object.",
    "The component calls the hook instead of holding the logic.",
    "Generated barrels are refreshed and validation passes.",
  ],
  replacesRules: ["akan.component.store-access", "akan.write.placement"],
};
