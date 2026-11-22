import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";

/** A base64 PNG, attached only when the active model can read one. */
export interface TurnFeedbackImage {
  data: string;
  mimeType: string;
}

export interface TurnFeedbackFinding {
  text: string;
  images?: TurnFeedbackImage[];
}

export interface TurnFeedbackSource {
  /** Budget is counted per key, so one stuck source cannot spend another's attempts. */
  key: string;
  /** Record whatever "before" this source compares against. Never throws — a source that cannot arm is skipped. */
  begin(): Promise<void> | void;
  /** What the turn caused that the agent cannot see, or `undefined` when there is nothing to say. */
  observe(): Promise<TurnFeedbackFinding | string | undefined> | TurnFeedbackFinding | string | undefined;
}

export interface TurnFeedbackOptions {
  /** How many times one source may reopen a turn before it gives up and lets the human see it. */
  budget: number;
  onNotice?: (message: string) => void;
}

// The engine's `agent_end` hook cannot veto the end of a turn, so a finding is a follow-up that opens a new one.
// The budget is load-bearing: without it one unfixable error reopens turns until the context or the wallet runs out.
export class TurnFeedback {
  readonly #sources: TurnFeedbackSource[];
  readonly #options: TurnFeedbackOptions;
  readonly #spent = new Map<string, number>();

  constructor(sources: TurnFeedbackSource[], options: TurnFeedbackOptions) {
    this.#sources = sources;
    this.#options = options;
  }

  extension(): InlineExtension {
    return {
      name: "akan-turn-feedback",
      factory: (pi: ExtensionAPI) => {
        pi.on("agent_start", async () => {
          await Promise.all(this.#sources.map((source) => TurnFeedback.#quietly(() => source.begin())));
        });
        pi.on("agent_end", async () => {
          const message = await this.collect();
          if (message) pi.sendUserMessage(message, { deliverAs: "followUp" });
        });
      },
    };
  }

  async collect() {
    const texts: string[] = [];
    const images: TurnFeedbackImage[] = [];
    const reopened: string[] = [];
    for (const source of this.#sources) {
      const finding = await TurnFeedback.#quietly(() => source.observe());
      if (!finding) {
        this.#spent.delete(source.key);
        continue;
      }
      const spent = this.#spent.get(source.key) ?? 0;
      if (spent >= this.#options.budget) {
        this.#options.onNotice?.(`${source.key}: still failing after ${spent} attempts — handing back to you.`);
        continue;
      }
      this.#spent.set(source.key, spent + 1);
      reopened.push(source.key);
      if (typeof finding === "string") texts.push(finding);
      else {
        texts.push(finding.text);
        images.push(...(finding.images ?? []));
      }
    }
    if (!texts.length) return undefined;
    this.#options.onNotice?.(`${reopened.join(" · ")} reopened the turn — esc stops it`);
    const text = [
      "The previous turn left problems you cannot see from the transcript. Fix them, then stop.",
      ...texts,
    ].join("\n\n");
    return images.length
      ? [{ type: "text" as const, text }, ...images.map((image) => ({ type: "image" as const, ...image }))]
      : text;
  }

  /** Every source is best-effort: no dev server, no git, no preview — all of them mean "nothing to report". */
  static async #quietly<T>(fn: () => T | Promise<T>) {
    try {
      return await fn();
    } catch {
      return undefined;
    }
  }
}
