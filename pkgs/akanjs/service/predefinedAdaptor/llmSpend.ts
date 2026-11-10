import type { LlmUsage } from "./llm.adaptor";

export interface LlmSpent {
  usage?: LlmUsage;
  model?: string;
  /** Some of `usage` is the framework's estimate: the call ended before the provider sent counts of its own. */
  estimated?: boolean;
}

//? A turn that fails after the provider began answering was still billed for its prompt, so the counts ride the error.
export class LlmSpend {
  //? Errs high: English and code run near four bytes a token, and a Hangul syllable, three bytes, near one token.
  static readonly bytesPerToken = 3;
  //? Anthropic's charge for a picture at its default size ceiling; counted as base64 text, 300KB would bill as 100k.
  static readonly imageTokens = 1_600;
  static readonly #spent = new WeakMap<object, LlmSpent>();
  static readonly #settling = new WeakMap<object, Promise<LlmSpent | null>>();

  static attach<E>(error: E, spent: LlmSpent): E {
    if (error && typeof error === "object") LlmSpend.#spent.set(error, { ...LlmSpend.of(error), ...spent });
    return error;
  }

  static of(error: unknown): LlmSpent | null {
    return error && typeof error === "object" ? (LlmSpend.#spent.get(error) ?? null) : null;
  }

  static async settled(error: unknown): Promise<LlmSpent | null> {
    const settling = error && typeof error === "object" ? LlmSpend.#settling.get(error) : undefined;
    return settling ? { ...LlmSpend.of(error), ...(await settling) } : LlmSpend.of(error);
  }

  static outlast<T>(call: Promise<T>, signal: AbortSignal, spentOf: (answer: T) => LlmSpent): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abandon = () => {
        const error = new DOMException("Nobody waits for this answer any more.", "AbortError");
        LlmSpend.#settling.set(
          error,
          call.then(spentOf, (failure: unknown) => LlmSpend.of(failure)).catch(() => null),
        );
        reject(error);
      };
      if (signal.aborted) abandon();
      else signal.addEventListener("abort", abandon, { once: true });
      void call.then(resolve, reject).finally(() => signal.removeEventListener("abort", abandon));
    });
  }

  //? An OpenAI-compatible stream counts nothing until its last chunk, so a call cut short is billed at what was sent
  //? and streamed wherever the provider's own count is missing or lower.
  static estimate(
    counted: LlmUsage | undefined,
    { prompt, streamed = "" }: { prompt?: unknown; streamed?: string },
  ): LlmSpent {
    const inputTokens = counted?.inputTokens || (prompt === undefined ? 0 : LlmSpend.promptOf(prompt));
    const outputTokens = Math.max(counted?.outputTokens ?? 0, LlmSpend.tokensOf(streamed));
    const estimated = inputTokens !== (counted?.inputTokens ?? 0) || outputTokens !== (counted?.outputTokens ?? 0);
    return {
      usage: { ...counted, inputTokens, outputTokens, cachedTokens: counted?.cachedTokens ?? 0 },
      ...(estimated ? { estimated } : {}),
    };
  }

  static tokensOf(text: string): number {
    return Math.ceil(Buffer.byteLength(text, "utf8") / LlmSpend.bytesPerToken);
  }

  static promptOf(request: unknown): number {
    let images = 0;
    const text = JSON.stringify(request, (_key, value: unknown) => {
      if (!LlmSpend.#isImage(value)) return value;
      images += 1;
      return undefined;
    });
    return LlmSpend.tokensOf(text ?? "") + images * LlmSpend.imageTokens;
  }

  static #isImage(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const { mimeType, text } = value as { mimeType?: unknown; text?: unknown };
    return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/") && !text;
  }
}
