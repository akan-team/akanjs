import type { CodeAgentEvent, CodeAgentEventBody } from "akanjs/common";

export class CodeAgentFrames {
  /** One turn's worth of frames is kept for reconnection; a client further behind reloads the transcript. */
  static readonly replayLimit = 2_000;
  readonly #listeners = new Set<(event: CodeAgentEvent) => void>();
  // Cleared at `idle`: an earlier turn is in the transcript; only the turn in flight exists nowhere else.
  readonly #replay: CodeAgentEvent[] = [];
  #replayFrom = 0;
  #seq = 0;
  #lastContextTokens: number | undefined;

  get replayFrom() {
    return this.#replayFrom;
  }

  since(seq: number) {
    return this.#replay.filter((event) => event.seq > seq);
  }

  on(listener: (event: CodeAgentEvent) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  emit(body: CodeAgentEventBody) {
    this.#seq += 1;
    const event = { ...body, seq: this.#seq } as CodeAgentEvent;
    this.#remember(event);
    for (const listener of this.#listeners) listener(event);
  }

  emitContext(usage: { tokens: number | null; contextWindow?: number } | undefined) {
    // `== null` on purpose: typed `number | null`, but `undefined` must not emit `used: undefined`.
    if (usage?.tokens == null) return;
    if (usage.tokens === this.#lastContextTokens) return;
    this.#lastContextTokens = usage.tokens;
    this.emit({ type: "context", used: usage.tokens, max: usage.contextWindow || undefined });
  }

  clear() {
    this.#listeners.clear();
  }

  #remember(event: CodeAgentEvent) {
    if (event.type === "idle") {
      this.#replay.length = 0;
      this.#replayFrom = event.seq;
      return;
    }
    this.#replay.push(event);
    while (this.#replay.length > CodeAgentFrames.replayLimit) {
      const dropped = this.#replay.shift();
      this.#replayFrom = dropped?.seq ?? this.#replayFrom;
    }
  }
}
