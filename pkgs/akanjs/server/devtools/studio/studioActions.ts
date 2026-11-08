import type { AkanGraphNode, AkanGraphNodeKind } from "akanjs/common";

export type StudioWorkflow =
  | "create-module"
  | "add-field"
  | "add-enum-field"
  | "add-mutation"
  | "add-slice"
  | "create-ui"
  | "rename-key";

export interface StudioAction {
  workflow: StudioWorkflow;
  label: string;
  inputs: { [input: string]: string };
  command: string;
}

const askedInputs: { [workflow in StudioWorkflow]: string[] } = {
  "create-module": ["module"],
  "add-field": ["field", "type"],
  "add-enum-field": ["field", "values"],
  "add-mutation": ["mutation", "guard"],
  "add-slice": ["slice"],
  "create-ui": ["surface"],
  "rename-key": ["to"],
};

const fieldActions: [StudioWorkflow, string][] = [
  ["add-field", "Add field"],
  ["add-enum-field", "Add enum field"],
];

const actionsByKind: { [kind in AkanGraphNodeKind]?: [StudioWorkflow, string][] } = {
  model: [...fieldActions, ["add-mutation", "Add mutation"], ["add-slice", "Add slice"], ["create-ui", "Create UI"]],
  scalar: fieldActions,
};

const keyInputs: { [kind in AkanGraphNodeKind]?: { input: string; label: string } } = {
  slice: { input: "slice", label: "Rename slice key" },
  query: { input: "query", label: "Rename query" },
};

export class StudioActions {
  static of(node: AkanGraphNode): StudioAction[] {
    const app = node.owner?.split("/").at(-1);
    if (!app || !node.module || node.change === "removed") return [];
    const target = { app, module: node.module };
    const keyed = keyInputs[node.kind];
    if (keyed)
      return node.name
        ? [StudioActions.#action("rename-key", keyed.label, { ...target, [keyed.input]: node.name })]
        : [];
    return (actionsByKind[node.kind] ?? []).map(([workflow, label]) => StudioActions.#action(workflow, label, target));
  }

  static ofApp(app: string): StudioAction[] {
    return [StudioActions.#action("create-module", "New module", { app })];
  }

  static #action(workflow: StudioWorkflow, label: string, inputs: StudioAction["inputs"]): StudioAction {
    const given = Object.entries(inputs).map(([name, value]) => `--${name} ${value}`);
    const asked = askedInputs[workflow].map((name) => `--${name} <${name}>`);
    return { workflow, label, inputs, command: ["akan workflow plan", workflow, ...given, ...asked].join(" ") };
  }
}
