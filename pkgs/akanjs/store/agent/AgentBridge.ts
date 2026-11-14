import { DataList } from "akanjs/base";
import { ConstantRegistry, type MaskModel, mask } from "akanjs/constant";
import type { AgentRefusal } from "akanjs/signal";
import type { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { type SerializedStoreState, StoreCatalogue } from "./StoreCatalogue";

/** Masked store reads for an in-page agent: `<model>Form` holds typed credentials, and reads ship to a remote model. */
export class AgentBridge {
  //? The route block of a turn's context names these when it leaves free text out, so a read of one needs no
  //? component to subscribe it: the page's own address is not a value a screen can withhold.
  static readonly routeKeys = ["pathname", "params", "searchParams"] as const;

  readonly refusals: AgentRefusal[];

  readonly #instance: StoreInstance;
  readonly #state: { [key: string]: SerializedStoreState };

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
    return [...this.#instance.liveKeysIn(viewKey).keys()]
      .filter((key) => !!this.#state[key])
      .sort((a, b) => a.localeCompare(b));
  }

  /** The masked value of a key a mounted component reads; throws for any other key. */
  read(key: string, viewKey = ""): unknown {
    const entry = this.#state[key];
    if (!entry) throw new Error(`Unknown state key: ${key}.${this.#readableInstead(viewKey)}`);
    const route = (AgentBridge.routeKeys as readonly string[]).includes(key);
    if (!route && !this.#instance.liveKeysIn(viewKey).has(key))
      throw new Error(
        `State key "${key}" is not read by this screen, so it is not part of its surface.${this.#readableInstead(viewKey)}`,
      );
    const value = AgentBridge.#unwrap(this.#instance.get()[key]);
    if (entry.refName && entry.modelType) {
      const model = ConstantRegistry.getModelRef(entry.refName, entry.modelType) as MaskModel;
      return mask(model, value);
    }
    if (route || AgentBridge.#isPlainValue(value)) return value;
    throw new Error(
      `State key "${key}" holds an object that belongs to no model, so there is nothing to mask it by and it is not published. Read the model's own keys instead.`,
    );
  }

  #readableInstead(viewKey: string): string {
    const keys = this.readableKeys(viewKey);
    return keys.length ? ` Readable here: ${keys.join(", ")}.` : " This screen reads no state keys.";
  }

  static #unwrap(value: unknown) {
    return value instanceof DataList ? value.values : value;
  }

  static #isPlainValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.every((item) => AgentBridge.#isPlainValue(item));
    if (value instanceof Date) return true;
    return typeof value !== "object";
  }
}
