import type { StudioNode, StudioNodeKind } from "./studioLayout";

export type StudioWorkflow =
  | "create-module"
  | "add-field"
  | "add-enum-field"
  | "add-mutation"
  | "add-slice"
  | "create-ui"
  | "rename-key";

export interface StudioAction {
  kind: "workflow" | "module";
  workflow?: StudioWorkflow;
  label: string;
  inputs: { [input: string]: string };
  command: string | null;
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

//? Scalars get none: the workflows read `lib/<module>/` and never `lib/__scalar/<module>/`, so apply would refuse.
const actionsByKind: { [kind in StudioNodeKind]?: [StudioWorkflow, string][] } = {
  model: [
    ["add-field", "Add field"],
    ["add-enum-field", "Add enum field"],
    ["add-mutation", "Add mutation"],
    ["add-slice", "Add slice"],
    ["create-ui", "Create UI"],
  ],
};
const identifier = /^[A-Za-z_$][\w$-]{0,63}$/;

const keyInputs: { [kind in StudioNodeKind]?: { input: string; label: string } } = {
  slice: { input: "slice", label: "Rename slice key" },
  query: { input: "query", label: "Rename query" },
};

export class StudioActions {
  static of(node: StudioNode): StudioAction[] {
    const app = node.owner?.split("/").at(-1);
    const { module } = node;
    if (!app || !module || module.startsWith("__") || node.change === "removed") return [];
    if (!identifier.test(app) || !identifier.test(module)) return [];
    const target = { app, module };
    const open: StudioAction = { kind: "module", label: "Open module", inputs: target, command: null };
    return [open, ...StudioActions.#workflowsOf(node, target)];
  }

  static #workflowsOf(node: StudioNode, target: StudioAction["inputs"]): StudioAction[] {
    const keyed = keyInputs[node.kind];
    if (!keyed)
      return (actionsByKind[node.kind] ?? []).map(([workflow, label]) =>
        StudioActions.#action(workflow, label, target),
      );
    return node.name && identifier.test(node.name)
      ? [StudioActions.#action("rename-key", keyed.label, { ...target, [keyed.input]: node.name })]
      : [];
  }

  static ofApp(app: string): StudioAction[] {
    return identifier.test(app) ? [StudioActions.#action("create-module", "New module", { app })] : [];
  }

  static #action(workflow: StudioWorkflow, label: string, inputs: StudioAction["inputs"]): StudioAction {
    const given = Object.entries(inputs).map(([name, value]) => `--${name} ${value}`);
    const asked = askedInputs[workflow].map((name) => `--${name} <${name}>`);
    const command = ["akan workflow plan", workflow, ...given, ...asked].join(" ");
    return { kind: "workflow", workflow, label, inputs, command };
  }
}
