import { getEnv } from "akanjs/base";
import { fetch, Translator } from "akanjs/client";
import { FailureCode } from "akanjs/common";
import { type AgentRunner, httpRunner, type RunnerEvent } from "use-agentic";

// A domain `Err` travels as its `<refName>.error.<key>`: the endpoint has no language to resolve it in, the chat does.
const errorKey = /^[a-zA-Z][A-Za-z0-9]*\.error\.[A-Za-z0-9_]+$/;

//? The key goes on as `code` once the text replaces it, so a host still branches on it; an older server sends none.
const readable = (event: RunnerEvent): RunnerEvent => {
  if (event.type !== "error" || !errorKey.test(event.message)) return event;
  const text = Translator.translateByLocale(Translator.getActiveLocale() ?? "en", event.message, event.data);
  if (text === event.message) return event;
  const code = event.code ?? (FailureCode.isKey(event.message) ? event.message : undefined);
  return {
    type: "error",
    message: text,
    ...(code ? { code } : {}),
    ...(event.overflow ? { overflow: event.overflow } : {}),
  };
};

/** Runs each turn against `<serverHttpUri>/runAgentTurn` (service signals mount unprefixed) through `httpRunner`. */
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
