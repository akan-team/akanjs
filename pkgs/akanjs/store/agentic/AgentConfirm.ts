export interface AgentConfirmPolicy {
  /** Whether an `st.tool` that declares no `confirm` asks first, read off its name. */
  byName: (name: string) => boolean;
  /** Whether the first call that changes something after the agent read the screen asks first; see `taint`. */
  afterScreenRead: boolean;
}

const POLICY_KEY = Symbol.for("akanjs.store.agentConfirm");

/** The app-wide defaults behind an agent's approval card; a tool's own `confirm` or `taint` always wins. */
export class AgentConfirm {
  static readonly writeVerbs = ["remove", "delete", "create", "update", "upsert", "submit", "save", "send", "export"];
  static readonly #verbs = new RegExp(`^(?:${AgentConfirm.writeVerbs.join("|")})(?![a-z])`);

  static isWrite(name: string) {
    return AgentConfirm.#verbs.test(name);
  }

  static get policy(): AgentConfirmPolicy {
    const holder = globalThis as typeof globalThis & { [POLICY_KEY]?: AgentConfirmPolicy };
    holder[POLICY_KEY] ??= { byName: AgentConfirm.isWrite, afterScreenRead: true };
    return holder[POLICY_KEY];
  }

  /** Applies to every tool declared after this call. */
  static set(policy: Partial<AgentConfirmPolicy>) {
    const holder = globalThis as typeof globalThis & { [POLICY_KEY]?: AgentConfirmPolicy };
    holder[POLICY_KEY] = { ...AgentConfirm.policy, ...policy };
  }
}
