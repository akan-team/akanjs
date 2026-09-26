import { EventStream } from "akanjs/common";
import type { AgentWireToolCall, LlmLimits, LlmUsage } from "akanjs/service";

interface StreamedTurn {
  text?: string;
  toolCalls?: AgentWireToolCall[];
  stop?: "end" | "toolUse" | "length";
  usage?: LlmUsage;
  limits?: LlmLimits;
}

type RunTurn = (onDelta: (delta: string) => void) => Promise<StreamedTurn>;

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
  static failure(error: unknown): {
    message: string;
    data?: Record<string, string | number>;
    overflow?: { limit?: number };
  } {
    const message = error instanceof Error ? error.message : String(error);
    const raw = (error as { data?: unknown } | null)?.data;
    const data =
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string | number>) : null;
    // The flag is the wire's, not the key's: a browser session answers it by compacting and asking again, and a
    // client that is not akan's cannot be expected to know what `agent.error.contextOverflow` means.
    const overflow =
      message === "agent.error.contextOverflow" ? (typeof data?.limit === "number" ? { limit: data.limit } : {}) : null;
    return { message, ...(data ? { data } : {}), ...(overflow ? { overflow } : {}) };
  }

  static response(run: RunTurn): Response {
    // Nothing to cancel: `run` takes no signal, so a turn whose reader went away finishes with nobody holding it.
    const stream = new EventStream(() => undefined);
    void AgentTurnStream.#deliver(stream, run);
    return stream.response();
  }

  static async #deliver(stream: EventStream, run: RunTurn) {
    try {
      let streamed = 0;
      const turn = await run((delta) => {
        if (!delta) return;
        streamed += delta.length;
        stream.write({ type: "text", delta });
      });
      // An adapter that ignores onDelta still resolves the whole text; deliver it as one late delta.
      if (!streamed && turn.text) stream.write({ type: "text", delta: turn.text });
      const toolCalls = turn.toolCalls ?? [];
      for (const call of toolCalls) stream.write({ type: "toolCall", id: call.id, name: call.name, args: call.args });
      // `length` travels as itself: the browser is the only side that can tell the user an answer was cut off.
      const stop = turn.stop === "length" ? "length" : turn.stop === "toolUse" || toolCalls.length ? "toolUse" : "end";
      const usage = turn.usage ? { input: turn.usage.inputTokens, output: turn.usage.outputTokens } : null;
      const limits = turn.limits && (turn.limits.window || turn.limits.output) ? turn.limits : null;
      stream.write({ type: "done", stop, ...(usage ? { usage } : {}), ...(limits ? { limits } : {}) });
    } catch (error) {
      // The status line is long gone once the stream is open, so a failure travels as the wire's error event.
      stream.write({ type: "error", ...AgentTurnStream.failure(error) });
    } finally {
      stream.close();
    }
  }
}
