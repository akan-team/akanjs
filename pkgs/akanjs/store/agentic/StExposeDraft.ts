import type { AgentFieldType } from "./AgentValue";
import { StExposeBuilder, type StExposeMeta } from "./StExposeBuilder";

/**
 * A readable value before it has said what it is: `st.expose("x", ID).desc("…")`.
 *
 * A falsy name declares nothing and publishes nothing, so a component whose publication is conditional keeps a
 * constant hook count instead of branching around the chain.
 */
export class StExposeDraft<T extends AgentFieldType> {
  readonly #name: string | null;
  readonly #type: T;
  readonly #meta: StExposeMeta;

  constructor(name: string | null, type: T, meta: StExposeMeta = {}) {
    this.#name = name;
    this.#type = type;
    this.#meta = meta;
  }

  desc(text: string): StExposeBuilder<T> {
    return new StExposeBuilder(this.#name, this.#type, text, this.#meta);
  }
}
