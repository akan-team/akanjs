import { Logger } from "akanjs/common";
import { type Guard, type GuardCls, type GuardScope, guardOf } from "./guard";
import type { SignalContext } from "./signalContext";

export class Public implements Guard {
  static name = "Public";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    return true;
  }
}

export class None implements Guard {
  static name = "None";
  static scope: GuardScope = "account";
  canPass(context: SignalContext): boolean {
    return false;
  }
}

/**
 * Gate for the `runAgentTurn` relay. Every tool runs in the caller's own browser session, so the LLM key is the
 * one thing this endpoint spends — ungated, any visitor can bill the app's provider through fetch alone.
 *
 * The framework has no account model to gate on, so with no guard registered it refuses every call — the same
 * answer `None` gives. An app names its own at boot, e.g. `AgentRelayAccess.use(Every)`, usually through
 * `option.setAgentAccess(...)`. Several are ANDed, as an endpoint's own `guards` array is.
 */
export class AgentRelayAccess implements Guard {
  // fetch serializes guard names and the API explorer filters on them; deleting this breaks that UI.
  static name = "AgentRelayAccess";
  static #guards: GuardCls[] = [];
  static #logger = new Logger("AgentRelayAccess");

  static use(guards: GuardCls | GuardCls[] | null) {
    AgentRelayAccess.#guards = guards ? (Array.isArray(guards) ? [...guards] : [guards]) : [];
  }

  static get hasPolicy() {
    return !!AgentRelayAccess.#guards.length;
  }

  /**
   * Whatever the registered guards need, since this one only forwards to them. With none registered it reads the
   * caller and nothing else — the refusal is unconditional — so a listing may still evaluate it argument-free.
   */
  static get scope(): GuardScope {
    return AgentRelayAccess.#guards.some((GuardCls) => GuardCls.scope === "resource") ? "resource" : "account";
  }

  async canPass(context: SignalContext): Promise<boolean> {
    const guards = AgentRelayAccess.#guards;
    if (!guards.length) return false;
    try {
      for (const GuardCls of guards) if (!(await guardOf(GuardCls).canPass(context))) return false;
      return true;
    } catch (error) {
      AgentRelayAccess.#logger.warn(
        `agent relay guard threw, failing closed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
