import { pipelinePlanLimits } from "./pipelinePlan";

/**
 * The one glob dialect of `when`, shared by the planner (`branch`, `app`) and the executor (`changed`) so both decide
 * alike. `*` is any run without `/`, `**` any run including `/` (and with its `/` also no segment at all), `?` one
 * character but `/`; everything else is literal and case-sensitive. A leading `!` excludes.
 */
export class PipelinePattern {
  static readonly #compiled = new Map<string, RegExp>();

  /** True when some positive pattern matches (or none is given) and no `!` pattern does. */
  static matches(pattern: string | readonly string[], value: string) {
    const patterns = PipelinePattern.#list(pattern);
    const positives = patterns.filter((glob) => !glob.startsWith("!"));
    const negatives = patterns.filter((glob) => glob.startsWith("!")).map((glob) => glob.slice(1));
    const included = !positives.length || positives.some((glob) => PipelinePattern.#regex(glob).test(value));
    return included && !negatives.some((glob) => PipelinePattern.#regex(glob).test(value));
  }

  /** `changed`: true when at least one of `values` matches. */
  static matchesAny(pattern: string | readonly string[], values: readonly string[]) {
    return values.some((value) => PipelinePattern.matches(pattern, value));
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

  static #regex(glob: string) {
    const cached = PipelinePattern.#compiled.get(glob);
    if (cached) return cached;
    let source = "";
    let idx = 0;
    while (idx < glob.length) {
      if (glob.startsWith("**/", idx)) {
        source += "(?:.*/)?";
        idx += 3;
      } else if (glob.startsWith("/**", idx) && idx + 3 === glob.length) {
        source += "(?:/.*)?";
        idx += 3;
      } else if (glob.startsWith("**", idx)) {
        source += ".*";
        idx += 2;
      } else {
        const char = glob.charAt(idx);
        source += char === "*" ? "[^/]*" : char === "?" ? "[^/]" : char.replace(/[.+^$|(){}[\]\\]/, "\\$&");
        idx += 1;
      }
    }
    const regex = new RegExp(`^${source}$`);
    PipelinePattern.#compiled.set(glob, regex);
    return regex;
  }
}
