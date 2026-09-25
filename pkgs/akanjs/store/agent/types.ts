import type { SliceStateKey } from "../state";

export interface SerializedStoreState {
  /**
   * What the live value is. A store declares no types — `STATE_META` holds initial values — so this is read off the
   * value the store is holding, and a key initialized to `null` or `[]` says nothing about what may go into it.
   */
  type: "string" | "number" | "boolean" | "date" | "list" | "map" | "object" | "unknown";
  /** The model this key holds, when it holds one. What a read of it is masked by. */
  refName?: string;
  /** Which of the model's five classes, which is what decides the fields a read may carry. */
  modelType?: "input" | "full" | "light" | "insight";
  /** Materialized from a computation, the URL, or storage. Writing one throws, so it is read-only by construction. */
  derived: boolean;
  role?: SliceStateKey;
}
