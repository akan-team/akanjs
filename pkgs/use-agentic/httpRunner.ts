import type { AgentRunner, RunnerEvent, ToolCallRequest } from "./types";

export interface HttpRunnerOptions {
  url: string;
  headers?: () => Record<string, string>;
  /** Swap the transport — tests, a framework's own HTTP client, a custom fetch with credentials. */
  fetcher?: typeof fetch;
}

interface TurnAnswer {
  text?: string;
  toolCalls?: ToolCallRequest[];
  stop?: "end" | "toolUse";
}

const eventTypes = new Set(["text", "toolCall", "done", "error"]);

const parseFrame = (frame: string): RunnerEvent | null => {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data) return null;
  const event = JSON.parse(data) as RunnerEvent;
  return eventTypes.has((event as { type?: string }).type ?? "") ? event : null;
};

/**
 * A manual reader loop rather than for-await: ReadableStream async iteration is still missing from browsers the
 * chat runs in. Breaking out early cancels the stream so the connection is released.
 */
async function* streamedEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<RunnerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut = buffer.indexOf("\n\n");
      while (cut !== -1) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        cut = buffer.indexOf("\n\n");
        const event = parseFrame(frame);
        if (!event) continue;
        yield event;
        if (event.type === "done" || event.type === "error") {
          ended = true;
          return;
        }
      }
    }
  } catch (error) {
    ended = true;
    if (!signal.aborted) yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    return;
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  if (!ended) yield { type: "error", message: "The turn stream ended without a done event." };
}

/** Only a flat record of scalars is forwarded: what a coded message interpolates, never a nested payload. */
const interpolations = (value: unknown): Record<string, string | number> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | number] => typeof entry[1] === "string" || typeof entry[1] === "number",
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
};

/**
 * The server's own message travels verbatim — it was written for whoever is reading the chat, and a prefix in
 * front of it both reads as two sentences and hides a coded message from the host that would have resolved it.
 * The status stands in only when the body says nothing.
 */
const turnError = async (response: Response): Promise<RunnerEvent> => {
  const fallback = { type: "error", message: `Agent turn failed: ${response.status}` } as const;
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown; data?: unknown };
    const message = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "";
    if (!message) return fallback;
    const data = interpolations(body.data);
    return { type: "error", message, ...(data ? { data } : {}) };
  } catch {
    return fallback;
  }
};

/**
 * The default runner: one stateless POST per assistant turn, negotiated via `accept`. A server that streams
 * answers `text/event-stream` — one `RunnerEvent` JSON per SSE `data:` line, ending with `done` — and one that
 * does not answers the single JSON `TurnAnswer`; both ride the same endpoint and the same request JSON.
 *
 * The wire is documented in WIRE.md so any backend can serve it.
 */
export const httpRunner = ({ url, headers, fetcher }: HttpRunnerOptions): AgentRunner => ({
  async *run(request) {
    const response = await (fetcher ?? fetch)(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream, application/json",
        ...(headers?.() ?? {}),
      },
      body: JSON.stringify({
        messages: request.messages,
        tools: request.tools,
        context: request.context,
        ...(request.instructions ? { instructions: request.instructions } : {}),
      }),
      signal: request.signal,
    });
    if (!response.ok) {
      yield await turnError(response);
      return;
    }
    if (response.headers.get("content-type")?.includes("text/event-stream") && response.body) {
      yield* streamedEvents(response.body, request.signal);
      return;
    }
    const turn = (await response.json()) as TurnAnswer;
    if (turn.text) yield { type: "text", delta: turn.text };
    for (const call of turn.toolCalls ?? []) yield { type: "toolCall", id: call.id, name: call.name, args: call.args };
    yield { type: "done", stop: turn.stop ?? (turn.toolCalls?.length ? "toolUse" : "end") };
  },
});
