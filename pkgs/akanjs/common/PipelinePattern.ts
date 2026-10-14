import { pipelinePlanLimits } from "./pipelinePlan";

type PatternToken =
  | { kind: "literal"; char: string }
  | { kind: "one" }
  | { kind: "star" }
  | { kind: "globstar" }
  | { kind: "globstarDir" }
  | { kind: "globstarTail" };

/**
 * The one glob dialect of `when`, shared by the planner (`branch`, `app`) and the executor (`changed`) so both decide
 * alike. `*` is any run without `/`, `**` any run including `/` (and with its `/` also no segment at all), `?` one
 * character but `/`; everything else is literal and case-sensitive. A leading `!` excludes.
 */
export class PipelinePattern {
  /** True when some positive pattern matches (or none is given) and no `!` pattern does. */
  static matches(pattern: string | readonly string[], value: string) {
    return PipelinePattern.#matcher(pattern)(value);
  }

  /** `changed`: true when at least one of `values` matches. */
  static matchesAny(pattern: string | readonly string[], values: readonly string[]) {
    return values.some(PipelinePattern.#matcher(pattern));
  }

  /** Braces and character classes are refused rather than given a meaning, so no implementation can read them apart. */
  static validate(pattern: string | readonly string[]): string | null {
    const patterns = PipelinePattern.#list(pattern);
    if (!patterns.length) return "a pattern list may not be empty";
    for (const glob of patterns) {
      const body = glob.startsWith("!") ? glob.slice(1) : glob;
      if (!body) return `"${glob}" matches nothing`;
      if (body.startsWith("!")) return `"${glob}" negates twice`;
      if (glob.length > pipelinePlanLimits.patternChars)
        return `"${glob.slice(0, 40)}…" is longer than ${pipelinePlanLimits.patternChars} characters`;
      if (/[{}[\]\\]/.test(body))
        return `"${glob}" uses braces, a character class or a backslash, which are not supported`;
    }
    return null;
  }

  static #list(pattern: string | readonly string[]) {
    return typeof pattern === "string" ? [pattern] : [...pattern];
  }

  static #matcher(pattern: string | readonly string[]) {
    const patterns = PipelinePattern.#list(pattern);
    const positives = patterns.filter((glob) => !glob.startsWith("!")).map((glob) => PipelinePattern.#tokens(glob));
    const negatives = patterns
      .filter((glob) => glob.startsWith("!"))
      .map((glob) => PipelinePattern.#tokens(glob.slice(1)));
    return (value: string) =>
      (!positives.length || positives.some((tokens) => PipelinePattern.#test(tokens, value))) &&
      !negatives.some((tokens) => PipelinePattern.#test(tokens, value));
  }

  static #tokens(glob: string): PatternToken[] {
    const tokens: PatternToken[] = [];
    let idx = 0;
    while (idx < glob.length) {
      if (glob.startsWith("**/", idx)) {
        tokens.push({ kind: "globstarDir" });
        idx += 3;
      } else if (glob.startsWith("/**", idx) && idx + 3 === glob.length) {
        tokens.push({ kind: "globstarTail" });
        idx += 3;
      } else if (glob.startsWith("**", idx)) {
        tokens.push({ kind: "globstar" });
        idx += 2;
      } else {
        const char = glob.charAt(idx);
        tokens.push(char === "*" ? { kind: "star" } : char === "?" ? { kind: "one" } : { kind: "literal", char });
        idx += 1;
      }
    }
    return tokens;
  }

  //? Not a RegExp, which backtracks: `*a*a*a…b` against a 40-character path took seconds. Here every position the
  //? pattern could be at advances together, so a match costs the pattern's length per character of the value.
  static #test(tokens: readonly PatternToken[], value: string) {
    let at = new Uint8Array(tokens.length + 1);
    let inRun = new Uint8Array(tokens.length);
    let nextAt = new Uint8Array(tokens.length + 1);
    let nextInRun = new Uint8Array(tokens.length);
    at[0] = 1;
    PipelinePattern.#takeEmptyMoves(tokens, at, inRun);
    for (let idx = 0; idx < value.length; idx += 1) {
      const char = value.charAt(idx);
      nextAt.fill(0);
      nextInRun.fill(0);
      tokens.forEach((token, pos) => {
        if (inRun[pos]) {
          nextInRun[pos] = 1;
          if (token.kind === "globstarDir" && char === "/") nextAt[pos + 1] = 1;
        }
        if (!at[pos]) return;
        if (token.kind === "literal" ? char === token.char : token.kind === "one" && char !== "/") nextAt[pos + 1] = 1;
        else if (token.kind === "globstar" || (token.kind === "star" && char !== "/")) nextAt[pos] = 1;
        else if (token.kind === "globstarTail" && char === "/") nextInRun[pos] = 1;
      });
      if (!nextAt.includes(1) && !nextInRun.includes(1)) return false;
      [at, nextAt] = [nextAt, at];
      [inRun, nextInRun] = [nextInRun, inRun];
      PipelinePattern.#takeEmptyMoves(tokens, at, inRun);
    }
    return at[tokens.length] === 1;
  }

  static #takeEmptyMoves(tokens: readonly PatternToken[], at: Uint8Array, inRun: Uint8Array) {
    tokens.forEach((token, pos) => {
      if (at[pos] && token.kind === "globstarDir") inRun[pos] = 1;
      const skipsEmpty = at[pos] && token.kind !== "literal" && token.kind !== "one";
      if (skipsEmpty || (inRun[pos] && token.kind === "globstarTail")) at[pos + 1] = 1;
    });
  }
}
