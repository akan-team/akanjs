import { DataList } from "akanjs/base";
import { ConstantRegistry, type MaskModel, mask } from "akanjs/constant";
import type { AgentRefusal } from "akanjs/signal";
import type { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { StoreCatalogue } from "./StoreCatalogue";
import type { SerializedStoreState } from "./types";

/**
 * What an in-page agent may read out of the store the user is looking at.
 *
 * Reads only. Driving the app is a component's declaration to make: `st.tool` binds a name and a schema to the
 * same handler the control on screen calls, so what an agent can do is what the screen offers the user and nothing
 * else. A store method that no component declared is not a lever this screen has — publishing one made the surface
 * the bundle rather than the screen, and gave the model levers whose effect it could not see.
 *
 * A key is readable while a mounted component subscribes it through `st.use` / `st.sel` / `st.ref`, and its value
 * is masked by the model that key declares. Masking is not optional even though the data mostly came from the
 * server already masked: `<model>Form` holds what the *user* typed, credentials included, and an in-page agent
 * ships what it reads to a remote model. The mask is by the declared model rather than by the value's class,
 * because `immerify` copies a form into a plain object and the class is gone by the time anyone can ask.
 */
export class AgentBridge {
  readonly refusals: AgentRefusal[];

  readonly #instance: StoreInstance;
  readonly #state: { [key: string]: SerializedStoreState };

  /** The bridge for the app running in this process: the one store every `st.use` goes through. */
  static of() {
    return new AgentBridge(StoreRegistry.instance);
  }

  constructor(instance: StoreInstance) {
    this.#instance = instance;
    const catalogue = new StoreCatalogue(instance);
    this.#state = catalogue.state;
    this.refusals = catalogue.refusals;
  }

  get state(): { [key: string]: SerializedStoreState } {
    return this.#state;
  }

  subscribe(listener: () => void) {
    return this.#instance.subscribe(listener);
  }

  /** The keys one view may read right now: subscribed by a mounted component and catalogued. */
  readableKeys(viewKey = ""): string[] {
    return [...this.#instance.liveKeysIn(viewKey).keys()].filter((key) => !!this.#state[key]).sort();
  }

  /**
   * The value behind a state key, stripped of what the model marks `hidden` or `secret`.
   *
   * The key itself has to be one the screen reads, not merely one its store owns: a component subscribing
   * `userList` says the screen shows a user list, and says nothing about `userForm` sitting in the same store.
   */
  read(key: string, viewKey = ""): unknown {
    const entry = this.#state[key];
    if (!entry) throw new Error(`Unknown state key: ${key}`);
    if (!this.#instance.liveKeysIn(viewKey).has(key))
      throw new Error(`State key "${key}" is not read by this screen, so it is not part of its surface.`);
    const value = AgentBridge.#unwrap(this.#instance.get()[key]);
    if (entry.refName && entry.modelType) {
      const model = ConstantRegistry.getModelRef(entry.refName, entry.modelType) as MaskModel;
      return mask(model, value);
    }
    if (AgentBridge.#isPlainValue(value)) return value;
    throw new Error(
      `State key "${key}" holds an object that belongs to no model, so there is nothing to mask it by and it is not published. Read the model's own keys instead.`,
    );
  }

  static #unwrap(value: unknown) {
    return value instanceof DataList ? value.values : value;
  }

  /** True when nothing inside could be carrying a model's fields, so there is nothing a mask would have to strip. */
  static #isPlainValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.every((item) => AgentBridge.#isPlainValue(item));
    if (value instanceof Date) return true;
    return typeof value !== "object";
  }
}
