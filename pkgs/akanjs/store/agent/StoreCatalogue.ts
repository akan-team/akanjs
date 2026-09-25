import type { Cls } from "akanjs/base";
import { ConstantRegistry } from "akanjs/constant";
import type { AgentRefusal } from "akanjs/signal";
import { databaseStateModelTypes, databaseStateNames } from "../databaseStateNames";
import type { SliceStateKey } from "../state";
import type { StoreInstance } from "../storeInstance";
import type { SerializedStoreState } from "./types";

/** Which of the model's classes each slice state key holds. The rest hold a primitive or a query descriptor. */
const sliceStateModelTypes: { [key in SliceStateKey]?: SerializedStoreState["modelType"] } = {
  defaultModel: "full",
  modelList: "light",
  modelInitList: "light",
  modelSelection: "light",
  modelInsight: "insight",
};

/**
 * Every store key an in-page agent may read, derived on the client from the store the browser is already running.
 *
 * Keys only — nothing here becomes a tool. What an agent may *do* is declared where the screen declares it, with
 * `st.tool` beside the control that does the same thing for the user; a store method nobody declared is the app's
 * own vocabulary and says nothing about what this screen offers. Deriving tools from the store published the
 * bundle rather than the screen, and every lever the screen did not have was noise the model paid for.
 *
 * Reads stay store-derived because a read has to be masked and only the store declares which model masks it. Which
 * of these keys is readable at a given moment is liveness rather than this catalogue — the keys the mounted
 * components subscribe. Plumbing in the base store opts out at the call site with `{ agent: false }`.
 *
 * It is derived on the client rather than shipped from the server: the store classes are in the bundle already,
 * and a second copy over the wire is a second thing to keep in step.
 */
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

  /**
   * The model each generated state key holds, taken from the declaration rather than from the value.
   *
   * A read has to be masked by the model, and the value cannot supply it: `immerify` copies a form into a plain
   * object, so `<model>Form` — an `Input` holding whatever the user typed — arrives with its class already gone.
   */
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

  /** `DataList` and `dayjs` are the two objects a store holds that are not what `typeof` says they are. */
  static #isList(value: object) {
    return "values" in value && Array.isArray((value as { values: unknown }).values);
  }

  static #refNameOf(value: unknown) {
    if (!value || typeof value !== "object") return {};
    const refName = ConstantRegistry.getRefName(value.constructor as Cls, { allowEmpty: true });
    return refName ? { refName } : {};
  }
}
