import type { LlmUsage } from "./llm.adaptor";

export interface LlmSpent {
  usage?: LlmUsage;
  model?: string;
}

//? A turn that fails after the provider began answering was still billed for its prompt, so the counts ride the error.
export class LlmSpend {
  static readonly #spent = new WeakMap<object, LlmSpent>();

  static attach<E>(error: E, spent: LlmSpent): E {
    if (error && typeof error === "object") LlmSpend.#spent.set(error, { ...LlmSpend.of(error), ...spent });
    return error;
  }

  static of(error: unknown): LlmSpent | null {
    return error && typeof error === "object" ? (LlmSpend.#spent.get(error) ?? null) : null;
  }
}
