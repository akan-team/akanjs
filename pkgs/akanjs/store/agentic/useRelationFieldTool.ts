"use client";
import { type Cls, type DataList, PrimitiveRegistry } from "akanjs/base";
import { capitalize } from "akanjs/common";
import { type ConstantField, ConstantRegistry } from "akanjs/constant";
import type { JsonSchema } from "use-agentic";
import { useScopePath, useSurface } from "use-agentic";
import { actionTagOf } from "../actionTag";
// Through the `"use client"` shim, not `react` — see `StToolBuilder`.
import { useEffect, useRef } from "../hooks";
import { FormFields } from "./formFields";

export interface RelationFieldSource<T extends { id: string }> {
  /** Read live from the store rather than closed over: `load` below changes the list mid-call. */
  read: () => DataList<T>;
  /** Loads the options an agent never opened the dropdown to fetch. */
  load: () => Promise<unknown> | unknown;
  /** How one option reads to a person, so the agent can match what it sees on screen. */
  label: (model: T) => string;
  disabled?: boolean;
}

/** The database model a relation field points at, or null for anything else — a primitive, an enum, a scalar. */
const relationOf = (field: ConstantField): string | null => {
  const modelRef = field.modelRef as unknown as Cls;
  if (field.fieldType !== "property" || field.enum || !modelRef || PrimitiveRegistry.has(modelRef)) return null;
  const refName = ConstantRegistry.getRefName(modelRef, { allowEmpty: true });
  return refName && ConstantRegistry.database.has(refName) ? refName : null;
};

/**
 * The two tools a relation picker owes an agent: list the documents it can pick, then pick by id.
 *
 * `FormFields` publishes no schema for a relation, and it is right not to — the form holds the whole related
 * document, so an id would need a lookup the store does not do. The picker is where that lookup lives: it holds
 * the slice list, the loader, and the label each option renders with. So the field reaches an agent from the one
 * component that can resolve it, which is the rule every other control follows — the control is the declaration.
 *
 * Listing is its own tool because loading is its own step for a person too: the options arrive when the dropdown
 * opens, and an agent never opens it. Folding the load into the setter would leave an agent guessing ids in order
 * to learn them from the refusal.
 */
export const useRelationFieldTool = <T extends { id: string }>(
  onChange: unknown,
  { read, load, label, disabled }: RelationFieldSource<T>,
) => {
  const surface = useSurface();
  const scope = useScopePath();
  const action = actionTagOf(onChange)?.action ?? null;
  const live = useRef({ onChange, read, load, label });
  live.current = { onChange, read, load, label };
  const scopeKey = scope.join(".");
  useEffect(() => {
    if (!action || disabled) return;
    const ref = FormFields.ref(action);
    const target = ref && relationOf(ref.field);
    // A field the form can describe on its own is `useFieldTool`'s: this hook exists for the one it cannot, and
    // publishing both would register one name twice with two different argument shapes.
    if (!ref || !target || FormFields.schema(ref.field)) return;
    const many = ref.field.arrDepth > 0;
    const nullable = !!ref.field.nullable && !many;
    const listName = `load${capitalize(ref.key)}OptionsOn${capitalize(ref.refName)}`;
    const argName = many ? `${ref.key}Ids` : `${ref.key}Id`;
    const id: JsonSchema = { type: "string" };
    const options = () => live.current.read().map((model) => ({ id: model.id, label: live.current.label(model) }));
    const idsIn = (args: Record<string, unknown>): unknown => {
      const value = args[argName];
      if (nullable && (value === null || value === undefined)) return [];
      return many ? value : [value];
    };
    const offList = surface.registerTool(scope, {
      name: listName,
      description: `List the ${target}s the ${ref.refName} form can pick for ${ref.key}, loading them first. Pass an id from it to ${action}.`,
      settle: false,
      run: async () => {
        await live.current.load();
        return options();
      },
    });
    const offSet = surface.registerTool(scope, {
      name: action,
      description: `Set ${ref.key} on the ${ref.refName} form to ${many ? `${target}s` : `one ${target}`}, by id. Call ${listName} first for the ids.`,
      parameters: {
        type: "object",
        properties: { [argName]: many ? { type: "array", items: id } : id },
        ...(nullable ? {} : { required: [argName] }),
        additionalProperties: false,
      },
      guard: (args) => {
        const ids = idsIn(args);
        if (!Array.isArray(ids)) return `"${argName}" of ${action} must be an array of ids.`;
        const list = live.current.read();
        const missing = ids.filter((value) => typeof value !== "string" || !list.get(value));
        if (!missing.length) return true;
        if (!list.length) return `No ${target} is loaded yet. Call ${listName} first for the ids.`;
        return `The ${ref.refName} form offers no ${target} ${missing.join(", ")}. It offers: ${list
          .map((model) => `${model.id} (${live.current.label(model)})`)
          .join(", ")}.`;
      },
      run: (args) => {
        const list = live.current.read();
        const setter = live.current.onChange as (value: unknown) => unknown;
        const picked = (idsIn(args) as string[]).flatMap((value) => {
          const model = list.get(value);
          return model ? [model] : [];
        });
        return setter(many ? picked : (picked[0] ?? null));
      },
    });
    return () => {
      offList();
      offSet();
    };
  }, [surface, scopeKey, action, disabled]);
};
