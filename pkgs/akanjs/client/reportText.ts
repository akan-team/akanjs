//? Loaded by the page's sender and by the report route, so it imports nothing and uses no lookbehind (Safari 16.3).
export class ReportText {
  //? A bidirectional control reorders how the text after it displays, so a line could show other than what it holds.
  static readonly #bidi = /[؜‎‏‪-‮⁦-⁩]/g;
  static readonly #bearer = /\b(bearer)\s+[\w.~+/=-]+/gi;
  static readonly #jwt = /\beyJ[\w-]{8,}\.[\w-]{8,}(?:\.[\w-]*)?/g;
  //? The label after the last dot is letters only, so `react@19.3.1` and a `fn@https://…` stack frame are kept.
  static readonly #email = /(^|[^\w.+-])[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){0,8}\.[a-z]{2,24}/gi;
  static readonly #word = /[^\s()]+/g;
  static readonly #queryStart = /[?#]/;
  static readonly #position = /(?::\d+){1,2}$/;

  static scrub(text: string): string {
    return text
      .replace(ReportText.#bidi, "")
      .replace(ReportText.#bearer, "$1 [redacted]")
      .replace(ReportText.#jwt, "[redacted]")
      .replace(ReportText.#email, "$1[email]")
      .replace(ReportText.#word, ReportText.#withoutQuery);
  }

  //? A URL or a path loses its query string and fragment, where a token rides; a stack frame keeps its `:line:column`.
  //? Word by word rather than one pattern, so a long run without a `?` is read once.
  static #withoutQuery(word: string): string {
    const at = word.search(ReportText.#queryStart);
    if (at < 0 || (!word.slice(0, at).includes("/") && !word.slice(at).includes("="))) return word;
    return `${word.slice(0, at)}${ReportText.#position.exec(word)?.[0] ?? ""}`;
  }
}
