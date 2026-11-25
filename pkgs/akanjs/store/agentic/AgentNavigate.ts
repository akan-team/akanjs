export interface AgentNavigateOptions {
  description?: string;
  /** How `navigate` and `goBack` wait for the page they land on; `settled` is the runtime's own wait. */
  settle?: (settled: () => Promise<void>) => Promise<void>;
}

const OPTIONS_KEY = Symbol.for("akanjs.store.agentNavigate");

/** App-wide settings of the runtime's `navigate` and `goBack`, read at every call. */
export class AgentNavigate {
  static get options(): AgentNavigateOptions {
    const holder = globalThis as typeof globalThis & { [OPTIONS_KEY]?: AgentNavigateOptions };
    return holder[OPTIONS_KEY] ?? {};
  }

  static set(options: AgentNavigateOptions) {
    const holder = globalThis as typeof globalThis & { [OPTIONS_KEY]?: AgentNavigateOptions };
    holder[OPTIONS_KEY] = { ...AgentNavigate.options, ...options };
  }
}
