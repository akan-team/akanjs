import { describe, expect, test } from "bun:test";
import { AnthropicLlm } from "./anthropicLlm";
import { OpenaiDialect } from "./openaiDialect";

const streamOf = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines.map((line) => `${line}\n`).join("")));
      controller.close();
    },
  });

describe("LLM usage", () => {
  test("OpenAI-dialect answers report usage whole and streamed, DeepSeek's cache field included", async () => {
    expect(
      OpenaiDialect.turnAnswer({
        choices: [{ message: { content: "hi" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 7, prompt_cache_hit_tokens: 60 },
      }).usage,
    ).toEqual({ inputTokens: 100, outputTokens: 7, cachedTokens: 60 });
    const streamed = await OpenaiDialect.consumeStream(
      streamOf([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "hi" }, finish_reason: "stop" }] })}`,
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 10 } } })}`,
        "data: [DONE]",
      ]),
      () => {},
    );
    expect(streamed.usage).toEqual({ inputTokens: 50, outputTokens: 3, cachedTokens: 10 });
    expect(OpenaiDialect.requestBody("m", { messages: [], tools: [], context: [] }, { stream: true })).toMatchObject({
      stream_options: { include_usage: true },
    });
  });

  test("Anthropic counts cache reads and writes as prompt, streamed or whole", async () => {
    const usage = { input_tokens: 20, output_tokens: 5, cache_read_input_tokens: 70, cache_creation_input_tokens: 10 };
    expect(AnthropicLlm.turnAnswer({ content: [{ type: "text", text: "x" }], usage }).usage).toEqual({
      inputTokens: 100,
      outputTokens: 5,
      cachedTokens: 70,
    });
    const streamed = await AnthropicLlm.consumeStream(
      streamOf([
        `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 20, cache_read_input_tokens: 70, output_tokens: 1 } } })}`,
        `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "x" } })}`,
        `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } })}`,
      ]),
      () => {},
    );
    expect(streamed.usage).toEqual({ inputTokens: 90, outputTokens: 9, cachedTokens: 70 });
  });
});
