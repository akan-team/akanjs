import { AkanError } from "akanjs/base";
import { hasErrKey } from "./hasErrKey";
import { Logger } from "./Logger";

export interface ErrRestoreOption {
  statusCode?: number;
  /** A generalized failure's `AkanError` code, which a restored copy keeps so its caller can branch on it. */
  code?: string;
  details?: unknown;
  path?: string;
  timestamp?: string;
}

export interface ErrPayload extends ErrRestoreOption {
  error: string;
  data?: Record<string, unknown>;
}

export type ErrConstructor<ErrorKey extends string> = (new (
  key: ErrorKey,
  data?: Record<string, unknown>,
  option?: ErrRestoreOption,
) => Err) & {
  prototype: Err;
  fromJSON(payload: ErrPayload): Err;
  is<Key extends ErrorKey>(error: unknown, ...keys: Key[]): error is Err & { readonly error: Key };
  BadRequest: ErrConstructor<ErrorKey>;
  Unauthorized: ErrConstructor<ErrorKey>;
  Forbidden: ErrConstructor<ErrorKey>;
  NotFound: ErrConstructor<ErrorKey>;
  Conflict: ErrConstructor<ErrorKey>;
};

const wireCode = Symbol("akan.err.wireCode");
const wireCodeOf = (err: Err) => (err as { readonly [wireCode]?: string })[wireCode];

//* `instanceof Err` holds within one copy of this module, and a page bundle and the framework each carry one: across
//* them, check with `Err.is`. Its message is the dictionary key; the caller's side translates it.
export class Err extends AkanError<string, Record<string, unknown>> {
  declare static status?: number;
  readonly error: string;
  readonly details?: unknown;
  readonly path?: string;
  readonly timestamp?: string;

  constructor(key: string, data?: Record<string, unknown>, option: ErrRestoreOption = {}) {
    const statusCode = new.target.status ?? option.statusCode ?? 400;
    //? A payload is untrusted JSON: only a string code is a wire code, as the duck-typed refusal check reads it.
    const code = typeof option.code === "string" ? option.code : undefined;
    super(code ?? AkanError.codeOfStatus(statusCode), key, { statusCode, data });
    this.name = this.constructor.name;
    this.error = key;
    this.details = option.details;
    this.path = option.path;
    this.timestamp = option.timestamp;
    //? Non-enumerable, so `{ ...err }` and a structured clone see what they saw before `code` came from the payload.
    if (code !== undefined) Object.defineProperty(this, wireCode, { value: code });
  }

  //? A wire code marks a failure its origin generalized, so a guard or an auth challenge must not read it as its own.
  override get forwarded() {
    return wireCodeOf(this) === undefined;
  }

  // `String(err)` is what a log line splices in, and the key alone drops what failed (an exit code, a status).
  override toString() {
    return this.data === undefined
      ? `${this.name}: ${this.message}`
      : `${this.name}: ${this.message} ${Logger.inlineData(this.data)}`;
  }

  //? The key names the failure, so the code goes out only when one came in with a generalized failure's payload.
  override toJSON(): ErrPayload & { statusCode: number } {
    const code = wireCodeOf(this);
    return {
      error: this.message,
      statusCode: this.statusCode,
      ...(code !== undefined ? { code } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
      ...(this.data !== undefined ? { data: this.data } : {}),
      ...(this.path !== undefined ? { path: this.path } : {}),
      ...(this.timestamp !== undefined ? { timestamp: this.timestamp } : {}),
    };
  }

  //? `this` is the status class it was called on, or `undefined` when called detached, which restores a plain `Err`.
  static fromJSON(this: typeof Err | undefined, payload: ErrPayload): Err {
    return new (this ?? Err)(payload.error, payload.data, payload);
  }

  /** A keyed error of this status class's status, and one of `keys` when any are named. Read off `error` and
   * `statusCode`, so a restored remote one passes too. */
  static override is<Key extends string>(error: unknown, ...keys: Key[]): error is Err & { readonly error: Key };
  //? Never chosen by a direct call; it keeps `typeof Err` assignable to `typeof AkanError`. Called through a
  //? `typeof AkanError` reference, it still reads `codes` as dictionary keys.
  static override is<E extends AkanError>(
    this: abstract new (
      ...args: never[]
    ) => E,
    error: unknown,
    ...codes: E["code"][]
  ): error is E;
  static override is(this: unknown, error: unknown, ...keys: string[]): boolean {
    const status = (this as { readonly status?: unknown } | undefined)?.status;
    return (
      hasErrKey(error, keys) &&
      (typeof status !== "number" || (error as { statusCode?: unknown }).statusCode === status)
    );
  }

  //? Typed, so the `.d.ts` names `typeof Err` for each instead of spelling out its class expression.
  static BadRequest: typeof Err = class BadRequestErr extends Err {
    static override status = 400;
  };

  static Unauthorized: typeof Err = class UnauthorizedErr extends Err {
    static override status = 401;
  };

  static Forbidden: typeof Err = class ForbiddenErr extends Err {
    static override status = 403;
  };

  static NotFound: typeof Err = class NotFoundErr extends Err {
    static override status = 404;
  };

  static Conflict: typeof Err = class ConflictErr extends Err {
    static override status = 409;
  };
}
