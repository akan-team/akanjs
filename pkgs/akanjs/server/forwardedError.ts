import { AkanError } from "akanjs/base";

export interface SerializedError {
  name: string;
  message: string;
  stack: string | null;
  code: string | null;
  cause: SerializedError | null;
}

//? An error crossing from the RSC worker to its host: IPC carries plain data, so the host rebuilds the chain from it.
export class ForwardedError extends AkanError {
  static readonly #causeDepth = 5;
  static readonly #textLimit = 16_000;

  constructor({ name, message, stack, code, cause }: SerializedError) {
    super(code ?? "renderError", message, cause ? { cause: new ForwardedError(cause) } : {});
    this.name = name;
    if (stack) this.stack = stack;
  }

  static serialize(error: unknown, depth = 0): SerializedError {
    const text = (value: unknown) => (typeof value === "string" ? value.slice(0, ForwardedError.#textLimit) : null);
    if (!(error instanceof Error))
      return { name: "NonError", message: ForwardedError.#describe(error), stack: null, code: null, cause: null };
    const { code } = error as { code?: unknown };
    const cause = depth < ForwardedError.#causeDepth && error.cause !== undefined ? error.cause : undefined;
    return {
      name: error.name,
      message: text(error.message) ?? "",
      stack: text(error.stack),
      code: typeof code === "string" ? code.slice(0, 200) : null,
      cause: cause === undefined ? null : ForwardedError.serialize(cause, depth + 1),
    };
  }

  static #describe(value: unknown): string {
    try {
      return String(value).slice(0, ForwardedError.#textLimit);
    } catch {
      return typeof value;
    }
  }
}
