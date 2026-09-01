import type { AgentWireToolCall } from "akanjs/service";

interface StreamedTurn {
  text?: string;
  toolCalls?: AgentWireToolCall[];
  stop?: "end" | "toolUse";
}

/**
 * The streaming half of the agent turn wire (use-agentic WIRE.md): the same endpoint answers `text/event-stream`
 * when the request asks for it, one RunnerEvent JSON per SSE `data:` line, ending with `done`. The signal layer
 * passes a raw `Response` through untouched, which is what lets one mutation serve both shapes.
 */
export class AgentTurnStream {
  static wants(request: Bun.BunRequest): boolean {
    return !!request.headers.get("accept")?.includes("text/event-stream");
  }

  /**
   * A domain `Err` carries its dictionary key as the message and the values its text interpolates as `data`, so
   * both travel: the key alone would reach the chat as `agent.error.…` with its placeholders unfilled.
   */
  static failure(error: unknown): { message: string; data?: Record<string, string | number> } {
    const message = error instanceof Error ? error.message : String(error);
    const data = (error as { data?: unknown } | null)?.data;
    return data && typeof data === "object" && !Array.isArray(data)
      ? { message, data: data as Record<string, string | number> }
      : { message };
  }

  static response(run: (onDelta: (delta: string) => void) => Promise<StreamedTurn>): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        try {
          let streamed = 0;
          const turn = await run((delta) => {
            if (!delta) return;
            streamed += delta.length;
            send({ type: "text", delta });
          });
          // An adapter that ignores onDelta still resolves the whole text; deliver it as one late delta.
          if (!streamed && turn.text) send({ type: "text", delta: turn.text });
          const toolCalls = turn.toolCalls ?? [];
          for (const call of toolCalls) send({ type: "toolCall", id: call.id, name: call.name, args: call.args });
          send({ type: "done", stop: turn.stop === "toolUse" || toolCalls.length ? "toolUse" : "end" });
        } catch (error) {
          // The status line is long gone once the stream is open, so a failure travels as the wire's error event.
          send({ type: "error", ...AgentTurnStream.failure(error) });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
    });
  }
}
