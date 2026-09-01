import { getEnv } from "akanjs/base";
import { fetch, Translator } from "akanjs/client";
import { type AgentRunner, httpRunner, type RunnerEvent } from "use-agentic";

/** `<refName>.error.<key>` — the shape a domain `Err` puts on the wire, its dictionary text being the message. */
const errorKey = /^[a-zA-Z][A-Za-z0-9]*\.error\.[A-Za-z0-9_]+$/;

/**
 * A server `Err` travels as its key, because the endpoint has no language to resolve it in — the chat does, so
 * the resolving happens here, one step before the transcript. Anything else is already a sentence somebody wrote,
 * and a key with no entry stays as it is rather than becoming a worse sentence.
 */
const readable = (event: RunnerEvent): RunnerEvent => {
  if (event.type !== "error" || !errorKey.test(event.message)) return event;
  const text = Translator.translateByLocale(Translator.getActiveLocale() ?? "en", event.message, event.data);
  return text === event.message ? event : { type: "error", message: text };
};

/**
 * Runs each assistant turn against the app's own `runAgentTurn` route — service signals mount unprefixed, so the
 * URL is `<serverHttpUri>/runAgentTurn` — through the shared `httpRunner`, which negotiates streaming via
 * `accept`: a server that streams answers SSE and the text arrives as it is generated; one that does not answers
 * the same JSON turn. The client runtime's fetch proxy is only probed for whether the endpoint exists (the util
 * lib ships one) and for the signed-in JWT; cookies ride the same-origin request on their own. The endpoint is a
 * stateless relay; the loop and every tool execution stay in this browser session.
 */
export const fetchRunner = (options: { fetcher?: typeof globalThis.fetch } = {}): AgentRunner => ({
  async *run(request) {
    const client = fetch as { runAgentTurn?: unknown; instance?: { jwt?: string | null } };
    if (typeof client.runAgentTurn !== "function") {
      yield { type: "error", message: "No runAgentTurn endpoint is mounted on this app, so the agent cannot answer." };
      return;
    }
    const runner = httpRunner({
      url: `${getEnv().serverHttpUri}/runAgentTurn`,
      headers: (): Record<string, string> => {
        const jwt = client.instance?.jwt;
        return jwt ? { authorization: `Bearer ${jwt}` } : {};
      },
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    });
    for await (const event of runner.run(request)) yield readable(event);
  },
});
