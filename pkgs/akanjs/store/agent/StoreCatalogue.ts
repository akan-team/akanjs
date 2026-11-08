import type { Cls } from "akanjs/base";
import { databaseStateNames } from "akanjs/common";
import { ConstantRegistry } from "akanjs/constant";
import type { AgentRefusal } from "akanjs/signal";
import type { SliceStateKey } from "../state";
import type { StoreInstance } from "../storeInstance";

export interface SerializedStoreState {
  /** Read off the live value — stores declare no types — so a `null`-initialized key says nothing. */
  type: "string" | "number" | "boolean" | "date" | "list" | "map" | "object" | "unknown";
  /** The model a read of this key is masked by. */
  refName?: string;
  modelType?: "input" | "full" | "light" | "insight";
  /** A `search()` or `computed()` key; writing it throws. */
  derived: boolean;
  role?: SliceStateKey;
}

const sliceStateModelTypes: { [key in SliceStateKey]?: SerializedStoreState["modelType"] } = {
  defaultModel: "full",
  modelList: "light",
  modelInitList: "light",
  modelSelection: "light",
  modelInsight: "insight",
};

// The agent catalogue masks a read by this declared class: `immerify` drops the constructor from the live value.
export const databaseStateModelTypes = {
  model: "full",
  modelForm: "input",
  defaultModel: "full",
} as const satisfies { [key in keyof ReturnType<typeof databaseStateNames>]?: SerializedStoreState["modelType"] };

/** Every store key an agent may read and the model its reads are masked by. Keys only: tools come from `st.tool`. */
export class StoreCatalogue {
  readonly state: { [key: string]: SerializedStoreState };
  readonly refusals: AgentRefusal[] = [];

  readonly #instance: StoreInstance;

  constructor(instance: StoreInstance) {
    this.#instance = instance;
    this.state = this.#state();
  }

  #state(): { [key: string]: SerializedStoreState } {
    const state = this.#instance.get();
    const declared = StoreCatalogue.#declaredStateModels();
    const entries = Object.keys(state)
      .sort()
      .map((key): [string, SerializedStoreState] => {
        const role = this.#instance.sliceStateRoles.get(key);
        const model = role
          ? { refName: role.refName, ...StoreCatalogue.#modelTypeOf(sliceStateModelTypes[role.role]) }
          : (declared.get(key) ?? StoreCatalogue.#refNameOf(state[key]));
        return [
          key,
          {
            type: StoreCatalogue.#typeOf(state[key]),
            ...model,
            ...(role ? { role: role.role } : {}),
            derived: this.#instance.derivedKeys.has(key),
          },
        ];
      });
    return Object.fromEntries(entries);
  }

  static #declaredStateModels() {
    const declared = new Map<string, { refName: string; modelType: SerializedStoreState["modelType"] }>();
    for (const refName of ConstantRegistry.database.keys()) {
      const names = databaseStateNames(refName);
      for (const [role, modelType] of Object.entries(databaseStateModelTypes))
        declared.set(names[role as keyof typeof names], { refName, modelType });
    }
    return declared;
  }

  static #modelTypeOf(modelType: SerializedStoreState["modelType"]) {
    return modelType ? { modelType } : {};
  }

  static #typeOf(value: unknown): SerializedStoreState["type"] {
    if (value === null || value === undefined) return "unknown";
    if (Array.isArray(value)) return "list";
    if (value instanceof Map) return "map";
    if (value instanceof Date) return "date";
    switch (typeof value) {
      case "string":
        return "string";
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "object":
        return StoreCatalogue.#isList(value) ? "list" : "object";
      default:
        return "unknown";
    }
  }

  static #isList(value: object) {
    return "values" in value && Array.isArray((value as { values: unknown }).values);
  }

  static #refNameOf(value: unknown) {
    if (!value || typeof value !== "object") return {};
    const refName = ConstantRegistry.getRefName(value.constructor as Cls, { allowEmpty: true });
    return refName ? { refName } : {};
  }
}
