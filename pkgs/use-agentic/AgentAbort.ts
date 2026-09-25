/**
 * The abort signal of the tool call running now.
 *
 * Reached through a module slot rather than a parameter for the same reason `AgentProgress` is — work several
 * frames down, a store action or a poll loop, reads it without every signature between here and there growing a
 * channel argument, and a session executes tool calls one at a time. Outside a call `current` is null, so a tool
 * that honours it runs unchanged in a test, under the dock, and on the server.
 *
 * Honouring it is optional: the session races every call against the same signal, so Stop lands whatever a tool
 * does. What reading it buys is the tool's own cleanup — a timer that would otherwise keep ticking for the rest of
 * its timeout with nobody left to answer.
 */
export class AgentAbort {
  static #signal: AbortSignal | null = null;

  static get current(): AbortSignal | null {
    return AgentAbort.#signal;
  }

  static async run<T>(signal: AbortSignal, exec: () => Promise<T> | T): Promise<T> {
    const outer = AgentAbort.#signal;
    AgentAbort.#signal = signal;
    try {
      return await exec();
    } finally {
      AgentAbort.#signal = outer;
    }
  }
}
