import { StToolBuilder, type StToolMeta } from "./StToolBuilder";

/**
 * A component tool before it has said what it does: `st.tool("x", { confirm }).desc("…")`.
 *
 * The description is the step that has to happen, so it is the one the type insists on. A model picks a tool by
 * that sentence and by nothing else, and the surface reads it a second time to tell fifty rows publishing one
 * interchangeable verb from two components that happened to pick the same name.
 */
export class StToolDraft {
  readonly #name: string | null;
  readonly #meta: StToolMeta;

  constructor(name: string | null, meta: StToolMeta = {}) {
    this.#name = name;
    this.#meta = meta;
  }

  desc(text: string): StToolBuilder {
    return new StToolBuilder(this.#name, text, this.#meta);
  }
}
