import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import type { CodeAgentModel } from "./akanCodeModel";

type CompactedModel = Pick<CodeAgentModel, "provider" | "id" | "contextWindow">;

// The engine compacts above `contextWindow - reserveTokens`, so a share of the window becomes a reserve per model.
export class AkanCodeCompaction {
  // Twice the engine's 16,384: at 16k a reasoning model stops mid-thought at the compaction threshold,
  // and the recovery re-sends a near-full window to retry the turn.
  static readonly reserveFloor = 32_768;
  static readonly steps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

  static isStep(percent: number) {
    return AkanCodeCompaction.steps.some((step) => step === percent);
  }

  /** `100` is the default itself, so it is stored as no choice at all. */
  static normalize(percent: number | undefined) {
    if (percent === undefined) return undefined;
    if (!AkanCodeCompaction.isStep(percent))
      throw new Error(`Autocompact takes a percent in steps of 10: ${AkanCodeCompaction.steps.join(", ")}.`);
    return percent === 100 ? undefined : percent;
  }

  static thresholdOf(contextWindow: number, percent: number | undefined) {
    const share = percent ? Math.floor((contextWindow * percent) / 100) : contextWindow;
    return Math.min(share, contextWindow - AkanCodeCompaction.reserveFloor);
  }

  static apply(settings: SettingsManager, model: CompactedModel, percent: number | undefined) {
    const threshold = AkanCodeCompaction.thresholdOf(model.contextWindow, percent);
    // Keyed by model, so the next model is never checked against a reserve sized for this one's window.
    settings.applyOverrides({
      compaction: {
        modelOverrides: { [`${model.provider}/${model.id}`]: { reserveTokens: model.contextWindow - threshold } },
      },
    });
  }

  /** Why `percent` cannot work on `model`, or undefined when it can. */
  static problemOf(model: CompactedModel, percent: number, keepRecentTokens: number) {
    const name = `${model.provider}/${model.id}`;
    if (model.contextWindow <= 0) return `${name} declares no context window, so it has no share to compact at.`;
    const threshold = AkanCodeCompaction.thresholdOf(model.contextWindow, percent);
    if (threshold >= keepRecentTokens) return undefined;
    const k = (tokens: number) => `${Math.round(tokens / 1000)}k`;
    return `Compacting at ${percent}% of the ${k(model.contextWindow)} window of ${name} starts at ${k(threshold)}, under the ${k(keepRecentTokens)} of recent turns every compaction keeps, so every turn would compact again.`;
  }
}
