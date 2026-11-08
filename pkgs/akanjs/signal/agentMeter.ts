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

/** `account` is whatever the app's account middleware put on the call; the framework has no account model. */
export class AgentMeter {
  static #usage: AgentUsageHook | null = null;
  static #quota: AgentQuotaHook | null = null;
  static #serial: boolean = true;
  static usageTimeoutMs = 30_000;
  static readonly #lanes = new Map<string, Promise<void>>();
  static #logger = new Logger("AgentMeter");

  /** `serial: false` lets one caller's turns run side by side again, each checking the quota on its own. */
  static use({
    usage,
    quota,
    serial,
  }: {
    usage?: AgentUsageHook | null;
    quota?: AgentQuotaHook | null;
    serial?: boolean;
  }) {
    if (usage !== undefined) AgentMeter.#usage = usage;
    if (quota !== undefined) AgentMeter.#quota = quota;
    if (serial !== undefined) AgentMeter.#serial = serial;
  }

  static async run<T extends { usage?: LlmUsage; model?: string }>(account: unknown, turn: () => Promise<T>) {
    const quota = AgentMeter.#quota;
    if (!quota) return await AgentMeter.#spend(account, turn, () => undefined);
    const key = AgentMeter.#serial ? AgentMeter.#keyOf(account) : null;
    if (key === null) {
      if (!(await quota({ account }))) throw new Err("agent.error.quotaExceeded");
      return await AgentMeter.#spend(account, turn, () => undefined);
    }
    //? One turn per caller until its usage is reported, or a burst sent together passes the quota before any is billed.
    const ahead = AgentMeter.#lanes.get(key);
    let open: () => void = () => undefined;
    const lane = new Promise<void>((resolve) => {
      open = resolve;
    });
    AgentMeter.#lanes.set(key, lane);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (AgentMeter.#lanes.get(key) === lane) AgentMeter.#lanes.delete(key);
      open();
    };
    try {
      await ahead;
      if (!(await quota({ account }))) throw new Err("agent.error.quotaExceeded");
      return await AgentMeter.#spend(account, turn, release);
    } catch (error) {
      release();
      throw error;
    }
  }

  static async #spend<T extends { usage?: LlmUsage; model?: string }>(
    account: unknown,
    turn: () => Promise<T>,
    settled: () => void,
  ) {
    const result = await turn();
    const hook = AgentMeter.#usage;
    const usage = result.usage;
    if (!hook || !usage) {
      settled();
      return result;
    }
    //* Never awaited: a slow or failing ledger must not cost the user a turn the provider already billed.
    const reported = Promise.resolve()
      .then(() => hook({ account, model: result.model ?? null, usage }))
      .catch((error: unknown) =>
        AgentMeter.#logger.error(`agent usage hook failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    const timeoutMs = AgentMeter.usageTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        AgentMeter.#logger.warn(
          `agent usage hook has not settled in ${timeoutMs} ms; the caller's next turn goes ahead`,
        );
        resolve();
      }, timeoutMs);
      timer.unref();
    });
    void Promise.race([reported, stalled]).finally(() => {
      clearTimeout(timer);
      settled();
    });
    return result;
  }

  //? An anonymous caller names no one to queue behind, so its turns are not held for one another.
  static #keyOf(account: unknown): string | null {
    if (!account || typeof account !== "object") return null;
    const { id, sub, sid } = account as { id?: unknown; sub?: unknown; sid?: unknown };
    const claim = [id, sub, sid].find((value) => typeof value === "string" && value);
    return typeof claim === "string" ? claim : null;
  }
}
