import { AkanEditScope } from "../tools/AkanEditScope";
import { AkanVerifier } from "../tools/AkanVerifier";
import type { TurnFeedbackSource } from "./TurnFeedback";

export interface VerifyFeedbackOptions {
  cwd: string;
  /** A read-only profile reports what is stale instead of running a chain that would write generated files. */
  readOnly?: boolean;
}

// A hook, not a reliance on the akan_verify tool: the observed failure is a model finishing without calling it.
export class VerifyFeedback implements TurnFeedbackSource {
  readonly key = "verify";
  readonly #options: VerifyFeedbackOptions;
  readonly #verifier: AkanVerifier;
  #baseline: ReadonlySet<string> = new Set();

  constructor(options: VerifyFeedbackOptions) {
    this.#options = options;
    this.#verifier = new AkanVerifier(options.cwd);
  }

  async begin() {
    this.#baseline = await AkanEditScope.baseline(this.#options.cwd);
  }

  async observe() {
    const scope = await AkanEditScope.since(this.#options.cwd, this.#baseline);
    if (!scope.apps.length && !scope.libs.length && !scope.pkgs.length) return undefined;
    if (this.#options.readOnly) return VerifyFeedback.#readOnlyNotice(scope.needsSync, [...scope.apps, ...scope.libs]);
    const report = await this.#verifier.verify(scope.paths);
    return report.ok ? undefined : report.text;
  }

  static #readOnlyNotice(needsSync: boolean, targets: string[]) {
    if (!needsSync) return undefined;
    return `Files were added or removed under ${targets.join(", ")}, so the generated barrels are stale. This profile does not write, so run \`akan sync ${targets.join(" ")}\` yourself before trusting a typecheck.`;
  }
}
