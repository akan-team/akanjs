import { PreviewView } from "../../preview/PreviewView";
import { AkanEditScope } from "../tools/AkanEditScope";
import type { TurnFeedbackFinding, TurnFeedbackSource } from "./TurnFeedback";

export interface PreviewFeedbackOptions {
  cwd: string;
  /** Origin of a running dev server. Without one the source is inert. */
  previewUrl?: string;
  /** Every akan route sits under `/:lang`, so a bare path renders nothing. */
  routes?: string[];
  /** Only a model whose input includes images gets a screenshot attached. */
  canSeeImages?: boolean;
}

// Findings are text, not screenshots: a few hundred tokens, readable by any model, and naming the defect.
export class PreviewFeedback implements TurnFeedbackSource {
  readonly key = "preview";
  readonly #options: PreviewFeedbackOptions;
  #baseline: ReadonlySet<string> = new Set();

  constructor(options: PreviewFeedbackOptions) {
    this.#options = options;
  }

  async begin() {
    this.#baseline = await AkanEditScope.baseline(this.#options.cwd);
  }

  async observe(): Promise<TurnFeedbackFinding | undefined> {
    if (!this.#options.previewUrl || !PreviewView.available) return undefined;
    const scope = await AkanEditScope.since(this.#options.cwd, this.#baseline);
    if (!scope.touchesTsx) return undefined;
    const findings: string[] = [];
    const images: { data: string; mimeType: string }[] = [];
    for (const route of this.#options.routes ?? ["/en/"]) {
      const url = new URL(route, this.#options.previewUrl).toString();
      const probe = await PreviewView.probe(url, { screenshot: !!this.#options.canSeeImages });
      const problems = [...probe.pageErrors, ...probe.consoleErrors, ...probe.consoleWarnings, ...probe.domFindings];
      if (!problems.length) continue;
      findings.push(`**${url}**\n${problems.map((line) => `- ${line}`).join("\n")}`);
      if (probe.screenshot) images.push({ data: probe.screenshot, mimeType: "image/png" });
    }
    if (!findings.length) return undefined;
    return { text: ["The rendered page has problems after your UI edits:", ...findings].join("\n\n"), images };
  }
}
