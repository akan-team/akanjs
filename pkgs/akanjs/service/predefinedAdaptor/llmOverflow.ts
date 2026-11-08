import { Logger } from "akanjs/common";
import { Err } from "akanjs/dictionary";
import { llmProviderOf } from "./llm.adaptor";

/** Each field is present only when the refusal named it. */
export interface LlmOverflowFacts {
  limit?: number;
  requested?: number;
}

/** Matches each provider's own too-long-prompt sentence; a status code cannot tell it from any other bad request. */
export class LlmOverflow {
  static readonly #logger = new Logger("LlmRefusal");
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

  /** `contextOverflow` when the prompt did not fit (the chat compacts and asks again), else `llmRequestFailed`. */
  static refusal(host: string, status: number, reason: string): Error {
    const provider = llmProviderOf(host);
    const overflow = LlmOverflow.match(reason);
    if (overflow) return new Err("agent.error.contextOverflow", { provider, ...overflow });
    // A provider's sentence can quote part of the API key or an account id, so only the server log carries it.
    LlmOverflow.#logger.warn(`${provider} refused a turn with status ${status}: ${reason}`);
    return new Err("agent.error.llmRequestFailed", { provider, status: String(status) });
  }

  static #count(text: string | undefined): number | undefined {
    const count = text ? Number(text.replace(/,/g, "")) : Number.NaN;
    return Number.isFinite(count) && count > 0 ? count : undefined;
  }
}
