//? A dictionary key (`<module>.error.<key>`) or a camelCase token. Security: bounded and prose-free, as a code is
//? passed on unfenced beside text a model reads.
export class FailureCode {
  static readonly #key = /^[A-Za-z][\w$-]{0,63}\.error\.[\w$.-]{1,120}$/;
  static readonly #token = /^[a-z][A-Za-z0-9]{0,63}$/;

  static isKey(value: unknown): value is string {
    return typeof value === "string" && FailureCode.#key.test(value);
  }

  static isToken(value: unknown): value is string {
    return typeof value === "string" && FailureCode.#token.test(value);
  }

  static is(value: unknown): value is string {
    return FailureCode.isKey(value) || FailureCode.isToken(value);
  }
}
