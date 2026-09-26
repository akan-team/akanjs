import { Err } from "akanjs/dictionary";
import { llmProviderOf } from "./llm.adaptor";

export interface LlmOverflowFacts {
  /** The window, when the refusal named it. */
  limit?: number;
  /** What the refused prompt measured, when the refusal named it. */
  requested?: number;
}

/**
 * Recognizes a provider refusing a prompt too long for its window, from the provider's own sentence — the one
 * refusal the chat can answer by itself, by summarizing and asking again. It is a list of sentences rather than a
 * rule because each provider wrote its own, and a status code does not tell a long prompt from any other bad
 * request.
 */
export class LlmOverflow {
  static readonly patterns = [
    /prompt (?:is )?too long/i, // Anthropic: "prompt is too long: 213462 tokens > 200000 maximum"
    /request_too_large/i, // Anthropic, past the request byte ceiling
    /context[_ ]length[_ ]exceeded/i, // OpenAI's error code
    /exceeds the context window/i, // OpenAI
    /maximum context length/i, // the OpenAI dialect: DeepSeek, OpenRouter, vLLM, LiteLLM
    /input token count.*exceeds the maximum/i, // Gemini
    /maximum prompt length is \d+/i, // xAI
    /reduce the length of the messages/i, // Groq
    /is longer than the model'?s context length/i, // Together
    /too large for model with \d+ maximum context length/i, // Mistral
  ];

  /** A quota borrows the same words, and compacting a conversation that fit loses detail for nothing. */
  static readonly quotas = [/rate limit/i, /too many requests/i, /per minute/i];

  static readonly measured = [
    /(?<requested>[\d,]+) tokens > (?<limit>[\d,]+) maximum/i,
    /maximum context length is (?<limit>[\d,]+) tokens(?:.*?requested (?:about )?(?<requested>[\d,]+))?/i,
    /input length \((?<requested>[\d,]+)\) exceeds model'?s maximum context length \((?<limit>[\d,]+)\)/i,
    /maximum context length of (?<limit>[\d,]+)/i,
    /input token count \((?<requested>[\d,]+)\) exceeds the maximum number of tokens allowed \((?<limit>[\d,]+)\)/i,
    /maximum prompt length is (?<limit>[\d,]+) but the request contains (?<requested>[\d,]+)/i,
    /input \((?<requested>[\d,]+) tokens\) is longer than the model'?s context length \((?<limit>[\d,]+) tokens\)/i,
  ];

  static match(reason: string): LlmOverflowFacts | null {
    if (LlmOverflow.quotas.some((pattern) => pattern.test(reason))) return null;
    if (!LlmOverflow.patterns.some((pattern) => pattern.test(reason))) return null;
    for (const pattern of LlmOverflow.measured) {
      const groups = pattern.exec(reason)?.groups;
      if (!groups) continue;
      const limit = LlmOverflow.#count(groups.limit);
      const requested = LlmOverflow.#count(groups.requested);
      return { ...(limit ? { limit } : {}), ...(requested ? { requested } : {}) };
    }
    return {};
  }

  /**
   * The `Err` for a refusal whose reason an adaptor has read: `contextOverflow` when the prompt did not fit, which
   * the relay flags so the chat compacts and asks again, and `llmRequestFailed` for anything else. An adaptor an
   * app writes throws through this too, and its refusals recover the same way.
   */
  static refusal(host: string, status: number, reason: string): Error {
    const provider = llmProviderOf(host);
    const overflow = LlmOverflow.match(reason);
    if (overflow) return new Err("agent.error.contextOverflow", { provider, ...overflow });
    return new Err("agent.error.llmRequestFailed", { provider, status: String(status), reason });
  }

  static #count(text: string | undefined): number | undefined {
    const count = text ? Number(text.replace(/,/g, "")) : Number.NaN;
    return Number.isFinite(count) && count > 0 ? count : undefined;
  }
}
