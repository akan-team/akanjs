import { adapt } from "../adapt";
import type { LlmAccepts, LlmAdaptor, LlmLimits, LlmOption, LlmTurnAnswer, LlmTurnRequest } from "./llm.adaptor";
import { LlmOverflow } from "./llmOverflow";
import { type OpenaiAnswer, OpenaiDialect } from "./openaiDialect";

/**
 * The OpenAI chat-completions dialect, pointed at a host — and the framework's default fill for `LlmAdaptorRole`.
 *
 * One class rather than one per vendor: DeepSeek, Groq, Together, OpenRouter, Ollama and a self-hosted vLLM all
 * serve this same wire, so what distinguishes them is `option.setLlm({ host, model })` and not a protocol. A
 * provider that speaks its own wire — Anthropic's blocks, Bedrock's signed requests — is a different adaptor
 * class, in this package or in the app's own `srvkit/`, applied with
 * `option.applyAdaptor(LlmAdaptorRole, TheClass)`.
 *
 * `model` is required and has no default. A default would be a model name that ages out of the provider's
 * catalogue into a 404 at the first turn, and — worse — it would decide the vision claim below on the app's
 * behalf.
 */
export class OpenaiLlm
  extends adapt("akanOpenaiLlm" as const, ({ use }) => ({
    llmOption: use<LlmOption>(),
  }))
  implements LlmAdaptor
{
  static readonly defaultHost = "https://api.openai.com/v1";

  get #host() {
    return this.llmOption.host ?? OpenaiLlm.defaultHost;
  }

  /** No answer ceiling: the dialect sends none, so the provider's own default is the one that applies. */
  get limits(): LlmLimits {
    return this.llmOption.contextWindow ? { window: this.llmOption.contextWindow } : {};
  }

  /**
   * OpenAI's own endpoint takes image parts, so that is what is claimed for the default host. A host the app
   * named is a gateway this class knows nothing about, and claiming vision for one is the worst guess available:
   * the bytes reach a model that cannot decode them and the whole turn dies on a 400, where text-only degrades
   * them to a note the model can repeat back. So a named host is text-only until `option.setLlm({ accepts })`
   * says otherwise — as is the OpenAI model that reads no image.
   */
  get accepts(): LlmAccepts | undefined {
    if (this.llmOption.accepts) return this.llmOption.accepts;
    return this.llmOption.host ? undefined : { image: true };
  }

  async chat(request: LlmTurnRequest, onDelta?: (delta: string) => void): Promise<LlmTurnAnswer | null> {
    const model = this.llmOption.model;
    if (!this.llmOption.apiKey || !model) {
      this.logger.warn(
        "OpenaiLlm needs both apiKey and model — set them with option.setLlm(). Agent turns are unavailable.",
      );
      return null;
    }
    try {
      const { accepts } = this;
      if (!onDelta) {
        const answer = await this.#api<OpenaiAnswer>(
          "/chat/completions",
          OpenaiDialect.requestBody(model, request, { accepts }),
        );
        return { ...OpenaiDialect.turnAnswer(answer), model };
      }
      const body = await this.#apiStream(
        "/chat/completions",
        OpenaiDialect.requestBody(model, request, { accepts, stream: true }),
      );
      return { ...(await OpenaiDialect.consumeStream(body, onDelta)), model };
    } catch (error) {
      // Logged here and rethrown rather than answered as `null`: a refusal the provider explained — a transcript
      // past the context window is the common one — is the whole of what the user needs to read in the chat, and
      // `null` would reach them as the one sentence that says a model is not configured.
      this.logger.error(`LLM turn failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async #api<T>(path: string, body: object): Promise<T> {
    const response = await fetch(`${this.#host}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.llmOption.apiKey}` },
      body: JSON.stringify(body),
      // A model turn regularly outlives the usual 20s adapter budget; long tool turns finish well within this.
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw await OpenaiLlm.refusal(this.#host, response);
    return (await response.json()) as T;
  }

  async #apiStream(path: string, body: object): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch(`${this.#host}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.llmOption.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) throw await OpenaiLlm.refusal(this.#host, response);
    return response.body;
  }

  /** Carried on the `Err` so the chat prints the provider's own sentence rather than a status number. */
  static async refusal(host: string, response: Response): Promise<Error> {
    return LlmOverflow.refusal(host, response.status, await OpenaiDialect.reasonOf(response));
  }
}
