import type { MessageAttachment } from "./types";

/**
 * What a tool's `run` returns when its answer includes files beside the value: `ToolReturn.attach(result, files)`.
 * `ToolRunner` lifts the files into `ToolCallResult.attachments`, which a backend hands the model as content.
 */
export class ToolReturn {
  /** Interned, not an `instanceof`: one page can hold several bundled copies of this package. */
  static readonly brand = Symbol.for("use-agentic.ToolReturn");

  readonly result: unknown;
  readonly attachments: MessageAttachment[];

  constructor(result: unknown, attachments: MessageAttachment[]) {
    this.result = result;
    this.attachments = attachments;
    Object.defineProperty(this, ToolReturn.brand, { value: true });
  }

  static attach(result: unknown, attachments: MessageAttachment[]): ToolReturn {
    return new ToolReturn(result, attachments);
  }

  static split(value: unknown): { result: unknown; attachments: MessageAttachment[] } {
    if (!ToolReturn.#is(value)) return { result: value, attachments: [] };
    return { result: value.result, attachments: value.attachments };
  }

  static #is(value: unknown): value is ToolReturn {
    return typeof value === "object" && value !== null && ToolReturn.brand in value;
  }
}
