import { AkanCodeCompaction } from "@akanjs/devkit/codeAgent/agent/AkanCodeCompaction";
import type { CodeAgentSessionInfo } from "akanjs/common";

export class CodeTuiAutoCompact {
  /** `60` and `60%` both name a step; anything else is undefined. */
  static parse(argument: string) {
    const percent = Number(argument.trim().replace(/%$/, ""));
    return argument.trim() && AkanCodeCompaction.isStep(percent) ? percent : undefined;
  }

  static describe(info: CodeAgentSessionInfo | undefined) {
    const percent = info?.autoCompactAt;
    const label = `autocompact ${percent ? `${percent}%` : "default"}`;
    const window = info?.contextTokens;
    if (!window) return label;
    const threshold = AkanCodeCompaction.thresholdOf(window, percent);
    const k = (tokens: number) => `${Math.round(tokens / 1000)}k`;
    const capped =
      percent && threshold < Math.floor((window * percent) / 100)
        ? `, the latest that still leaves ${k(window - threshold)} for the reply`
        : "";
    return `${label} · compacts above ${k(threshold)} of ${k(window)}${capped}`;
  }

  static usage(info: CodeAgentSessionInfo | undefined) {
    return [
      "Usage: /autocompact <percent>",
      "",
      `now: ${CodeTuiAutoCompact.describe(info)}`,
      `${AkanCodeCompaction.steps.join(" · ")} — 100 is the default`,
    ].join("\n");
  }
}
