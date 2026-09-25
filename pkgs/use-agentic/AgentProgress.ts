export interface AgentProgressReport {
  /** One short line about the step in flight. Read by the user, not the model — keep it prose. */
  message: string;
  done?: number;
  total?: number;
}

/**
 * The progress channel for the tool call running now.
 *
 * Reached through a module slot rather than a parameter so work several frames down — a store action, an upload
 * loop, an adapter — reports without every signature between here and there growing a channel argument. The
 * browser has no `AsyncLocalStorage`, and it needs none: a session executes tool calls one at a time, and `run`
 * saves and restores the slot so a tool that calls another tool through the surface nests correctly.
 *
 * Outside a call `report` is a no-op, so the same code runs unchanged in a test, on the server, and under a host
 * that renders no progress at all.
 */
export class AgentProgress {
  static #sink: ((report: AgentProgressReport) => void) | null = null;

  static report(message: string, amount: { done?: number; total?: number } = {}) {
    AgentProgress.#sink?.({ message, ...amount });
  }

  /** True while someone is rendering the reports, for a message that costs something to assemble. */
  static get watching() {
    return !!AgentProgress.#sink;
  }

  static async run<T>(sink: (report: AgentProgressReport) => void, exec: () => Promise<T> | T): Promise<T> {
    const outer = AgentProgress.#sink;
    AgentProgress.#sink = sink;
    try {
      return await exec();
    } finally {
      AgentProgress.#sink = outer;
    }
  }
}
