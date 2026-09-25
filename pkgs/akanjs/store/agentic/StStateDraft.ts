import type { AgentFieldType } from "./AgentValue";
import { StStateBuilder, type StStateMeta } from "./StStateBuilder";

/**
 * Local state before it has said what it is: `st.useState("tab", String, { set: true }).desc("…")`.
 *
 * A falsy name keeps the state and publishes nothing, so a conditional surface never changes the hook count.
 */
export class StStateDraft<T extends AgentFieldType> {
  readonly #name: string | null;
  readonly #type: T;
  readonly #meta: StStateMeta;

  constructor(name: string | null, type: T, meta: StStateMeta = {}) {
    this.#name = name;
    this.#type = type;
    this.#meta = meta;
  }

  desc(text: string): StStateBuilder<T> {
    return new StStateBuilder(this.#name, this.#type, text, this.#meta);
  }
}
