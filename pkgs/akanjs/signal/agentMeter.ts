import type { PromiseOrObject } from "akanjs/base";
import { Logger } from "akanjs/common";
import { Err } from "akanjs/dictionary";
import type { LlmUsage } from "akanjs/service";

export interface AgentUsageReport {
  account: unknown;
  model: string | null;
  usage: LlmUsage;
}

export interface AgentQuotaCheck {
  account: unknown;
}

export type AgentUsageHook = (report: AgentUsageReport) => PromiseOrObject<void>;
export type AgentQuotaHook = (check: AgentQuotaCheck) => PromiseOrObject<boolean>;

/**
 * The relay's metering seam: a quota asked before a turn spends the key, and the provider's own token counts
 * reported after it. `account` is whatever the app's account middleware put on the call — the framework has no
 * account model, so it hands the value through rather than guessing at an id.
 */
export class AgentMeter {
  static #usage: AgentUsageHook | null = null;
  static #quota: AgentQuotaHook | null = null;
  static #logger = new Logger("AgentMeter");

  static use({ usage, quota }: { usage?: AgentUsageHook | null; quota?: AgentQuotaHook | null }) {
    if (usage !== undefined) AgentMeter.#usage = usage;
    if (quota !== undefined) AgentMeter.#quota = quota;
  }

  static async run<T extends { usage?: LlmUsage; model?: string }>(account: unknown, turn: () => Promise<T>) {
    if (AgentMeter.#quota && !(await AgentMeter.#quota({ account }))) throw new Err("agent.error.quotaExceeded");
    const result = await turn();
    const hook = AgentMeter.#usage;
    //* Reported after the answer is in hand and never awaited by it: a slow or failing ledger must not cost the
    //* user a turn the provider has already billed.
    if (hook && result.usage)
      void Promise.resolve()
        .then(() => hook({ account, model: result.model ?? null, usage: result.usage as LlmUsage }))
        .catch((error: unknown) =>
          AgentMeter.#logger.error(
            `agent usage hook failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    return result;
  }
}
