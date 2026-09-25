import type { ResourceDiff, ToolCallResult } from "./types";

/**
 * The ceiling on what one tool call may add to the transcript.
 *
 * A tool returns whatever the app's own code returns, and a screen's state is not sized for a model's window: one
 * `readState` of a list whose records carry inlined bytes is megabytes, which the loop then posts on this turn and
 * on every turn after it. Compaction cannot save that — it summarizes what is *above* the cut and this arrives
 * below it — so the value is bounded where it enters the transcript instead. The framework's own big reader
 * (`ScreenReader.limit`) already caps itself; this is the same courtesy for every other tool.
 *
 * Clipped rather than dropped, and the note says what happened: a model handed a value it cannot see the end of
 * asks a narrower question, where one handed nothing answers from the field names.
 */
export class ToolOutput {
  /** Characters, ~5k tokens: comfortably above `ScreenReader.limit` and far below any provider's window. */
  static readonly limit = 20_000;

  /** Four characters per token, over the JSON the result rides as — the same estimate `Compaction` places. */
  static tokensOf(result: ToolCallResult): number {
    return Math.ceil(JSON.stringify(result).length / 4);
  }

  static clipped(result: ToolCallResult): ToolCallResult {
    return {
      ...result,
      ...(result.result !== undefined ? { result: ToolOutput.#within(result.result) } : {}),
      ...(result.changes?.length ? { changes: result.changes.map((change) => ToolOutput.#change(change)) } : {}),
      ...(result.error ? { error: ToolOutput.#text(result.error) } : {}),
    };
  }

  static #change(change: ResourceDiff): ResourceDiff {
    return change.value === undefined ? change : { ...change, value: ToolOutput.#within(change.value) };
  }

  /**
   * The note leads the payload rather than trailing it: a provider that truncates on its own end, and a reader
   * skimming the chat, both see the ceiling before they see the value it cut.
   */
  static #within(value: unknown): unknown {
    const json = JSON.stringify(value) ?? "";
    if (json.length <= ToolOutput.limit) return value;
    return `${ToolOutput.#note(json.length)}\n${json.slice(0, ToolOutput.limit)}…`;
  }

  static #text(text: string): string {
    if (text.length <= ToolOutput.limit) return text;
    return `${ToolOutput.#note(text.length)}\n${text.slice(0, ToolOutput.limit)}…`;
  }

  static #note(chars: number): string {
    return (
      `[Truncated: this value is ${chars} characters (~${Math.ceil(chars / 4)} tokens), past the ` +
      `${ToolOutput.limit}-character ceiling one tool result may add to this conversation. The first ` +
      `${ToolOutput.limit} characters follow. Read a narrower part of it — one record, one field — rather than ` +
      `asking for the whole value again, and tell the user if you cannot answer from what you can see.]`
    );
  }
}
