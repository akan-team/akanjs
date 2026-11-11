import { EventStream, Logger } from "akanjs/common";
import type { AgentWireToolCall, LlmLimits, LlmUsage } from "akanjs/service";
import { isExceptionLike } from "./exception";
import { SignalFailure } from "./SignalFailure";

interface StreamedTurn {
  text?: string;
  toolCalls?: AgentWireToolCall[];
  stop?: "end" | "toolUse" | "length";
  usage?: LlmUsage;
  limits?: LlmLimits;
}

type RunTurn = (onDelta: (delta: string) => void, signal: AbortSignal) => Promise<StreamedTurn>;

// use-agentic WIRE.md: one RunnerEvent JSON per SSE `data:` line, ending with `done`. The signal layer passes a raw
// `Response` through untouched, which is what lets one mutation serve both shapes.
export class AgentTurnStream {
  static #logger = new Logger("AgentTurnStream");

  static wants(request: Bun.BunRequest): boolean {
    return !!request.headers.get("accept")?.includes("text/event-stream");
  }

  /** A domain `Err`'s `data` travels with its key, or the chat could not fill the text's placeholders. */
  static failure(error: unknown): {
    message: string;
    code: string;
    data?: Record<string, string | number>;
    overflow?: { limit?: number };
  } {
    const status = isExceptionLike(error) ? error.statusCode : SignalFailure.generalized(error).statusCode;
    const code = SignalFailure.codeOf(error, status);
    //? Security: an adapter's error can quote the provider's response, so it is generalized like an HTTP failure.
    if (!isExceptionLike(error)) {
      const detail = error instanceof Error ? error.message : String(error);
      return { message: SignalFailure.detailed ? detail : SignalFailure.message, code };
    }
    const message = error instanceof Error ? error.message : String(error);
    const raw = (error as { data?: unknown } | null)?.data;
    const data =
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string | number>) : null;
    // A wire flag, since a non-akan client cannot be expected to know `agent.error.contextOverflow`.
    const overflow =
      message === "agent.error.contextOverflow" ? (typeof data?.limit === "number" ? { limit: data.limit } : {}) : null;
    return { message, code, ...(data ? { data } : {}), ...(overflow ? { overflow } : {}) };
  }

  static response(run: RunTurn): Response {
    const abort = new AbortController();
    const stream = new EventStream(() => abort.abort());
    void AgentTurnStream.#deliver(stream, run, abort.signal);
    return stream.response();
  }

  static async #deliver(stream: EventStream, run: RunTurn, signal: AbortSignal) {
    try {
      let streamed = 0;
      const turn = await run((delta) => {
        if (!delta) return;
        streamed += delta.length;
        stream.write({ type: "text", delta });
      }, signal);
      // An adapter that ignores onDelta still resolves the whole text; deliver it as one late delta.
      if (!streamed && turn.text) stream.write({ type: "text", delta: turn.text });
      const toolCalls = turn.toolCalls ?? [];
      for (const call of toolCalls) stream.write({ type: "toolCall", id: call.id, name: call.name, args: call.args });
      const stop = turn.stop === "length" ? "length" : turn.stop === "toolUse" || toolCalls.length ? "toolUse" : "end";
      const usage = turn.usage ? { input: turn.usage.inputTokens, output: turn.usage.outputTokens } : null;
      const limits = turn.limits && (turn.limits.window || turn.limits.output) ? turn.limits : null;
      stream.write({ type: "done", stop, ...(usage ? { usage } : {}), ...(limits ? { limits } : {}) });
    } catch (error) {
      if (signal.aborted) return;
      if (!isExceptionLike(error))
        AgentTurnStream.#logger.error(`agent turn failed after its stream opened: ${String(error)}`);
      // The status line is long gone once the stream is open.
      stream.write({ type: "error", ...AgentTurnStream.failure(error) });
    } finally {
      stream.close();
    }
  }
}
