import { describe, expect, test } from "bun:test";
import { Err } from "akanjs/dictionary";
import { AnthropicLlm } from "./anthropicLlm";
import { LlmSpend } from "./llmSpend";
import { OpenaiDialect } from "./openaiDialect";

const streamOf = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines.map((line) => `${line}\n`).join("")));
      controller.close();
    },
  });

const toolFrame = (args: string) => [
  `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "write", arguments: args } }] } }] })}`,
];
const anthropicToolFrames = (args: string) => [
  `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "c1", name: "write" } })}`,
  `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: args } })}`,
];
const finished = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}`;
const stopped = `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" } })}`;
const none = () => undefined;

describe("a stream that did not finish", () => {
  const openai = (lines: string[]) => OpenaiDialect.consumeStream(streamOf(lines), none, "https://llm.test");
  const anthropic = (lines: string[]) => AnthropicLlm.consumeStream(streamOf(lines), none, "https://llm.test");

  test("an OpenAI call with no finish reason or [DONE], or arguments that do not parse, is cut", async () => {
    expect((await openai(toolFrame('{"a":1}'))).stop).toBe("length");
    expect((await openai([...toolFrame('{"a":'), finished])).stop).toBe("length");
    expect((await openai([...toolFrame("[1]"), finished])).stop).toBe("length");
  });

  test("an OpenAI call that finished is not, a gateway's bare [DONE] and a no-argument call included", async () => {
    expect((await openai([...toolFrame('{"a":1}'), finished])).stop).toBe("toolUse");
    expect((await openai([...toolFrame('{"a":1}'), "data: [DONE]"])).stop).toBe("toolUse");
    expect((await openai([...toolFrame(""), finished])).stop).toBe("toolUse");
  });

  test("an Anthropic call with no stop reason, or arguments that do not parse, is cut", async () => {
    expect((await anthropic(anthropicToolFrames('{"a":1}'))).stop).toBe("length");
    expect((await anthropic([...anthropicToolFrames('{"a":'), stopped])).stop).toBe("length");
    expect((await anthropic([...anthropicToolFrames('{"a":1}'), stopped])).stop).toBe("toolUse");
  });

  test("an error frame fails the turn, carrying what was streamed, instead of reading as an answer", async () => {
    const text = `data: ${JSON.stringify({ choices: [{ delta: { content: "half an answer" } }] })}`;
    const frame = `data: ${JSON.stringify({ error: { message: "overloaded", code: 503 } })}`;
    const failure = await openai([text, frame]).catch((error: unknown) => error);
    expect(Err.is(failure, "agent.error.llmRequestFailed")).toBe(true);
    expect((failure as { data?: unknown }).data).toEqual({ provider: "llm.test", status: "503" });
    expect(LlmSpend.of(failure)?.usage?.outputTokens).toBeGreaterThan(0);
  });

  test("an Anthropic error event fails the turn even mid tool call", async () => {
    const frame = `data: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}`;
    const failure = await anthropic([...anthropicToolFrames('{"a":'), frame]).catch((error: unknown) => error);
    expect(Err.is(failure, "agent.error.llmRequestFailed")).toBe(true);
  });

  test("a prompt-too-long error frame is the same overflow a refused request is", async () => {
    const frame = `data: ${JSON.stringify({ error: { message: "maximum context length is 8000 tokens" } })}`;
    const failure = await openai([frame]).catch((error: unknown) => error);
    expect(Err.is(failure, "agent.error.contextOverflow")).toBe(true);
  });
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
      cacheWriteTokens: 10,
    });
    const streamed = await AnthropicLlm.consumeStream(
      streamOf([
        `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 20, cache_read_input_tokens: 70, output_tokens: 1 } } })}`,
        `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "x" } })}`,
        `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 9 } })}`,
      ]),
      () => {},
    );
    expect(streamed.usage).toEqual({ inputTokens: 90, outputTokens: 9, cachedTokens: 70, cacheWriteTokens: 0 });
  });

  test("a stream cut before its counts carries an estimate of what it streamed, tool arguments included", async () => {
    const args = JSON.stringify({ body: "a long document the model was writing into a tool call" });
    const frames = [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "write", arguments: "" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: args } }] } }] },
    ];
    let pulled = 0;
    const cut = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled++) return controller.error(new Error("socket closed"));
        controller.enqueue(new TextEncoder().encode(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("")));
      },
    });
    const failure = await OpenaiDialect.consumeStream(cut, () => {}).catch((error: unknown) => error);
    expect(LlmSpend.of(failure)).toEqual({
      usage: { inputTokens: 0, outputTokens: LlmSpend.tokensOf(args), cachedTokens: 0 },
      estimated: true,
    });
  });

  test("a stream cut after the provider's final counts keeps them rather than an estimate", async () => {
    const frames = [
      { choices: [{ delta: { content: "A whole answer, every word of it" }, finish_reason: "stop" }] },
      { choices: [], usage: { prompt_tokens: 50, completion_tokens: 3 } },
    ];
    let pulled = 0;
    const cut = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled++) return controller.error(new Error("socket closed"));
        controller.enqueue(new TextEncoder().encode(frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("")));
      },
    });
    const failure = await OpenaiDialect.consumeStream(cut, () => {}).catch((error: unknown) => error);
    expect(LlmSpend.of(failure)).toEqual({ usage: { inputTokens: 50, outputTokens: 3, cachedTokens: 0 } });
  });

  test("a prompt's estimate counts a picture at the image rate, not as its base64", () => {
    const data = "A".repeat(300_000);
    const withPicture = { messages: [{ role: "user", attachments: [{ name: "p.png", mimeType: "image/png", data }] }] };
    expect(LlmSpend.promptOf(withPicture)).toBeLessThan(LlmSpend.imageTokens + 100);
    expect(LlmSpend.promptOf({ text: "가".repeat(300) })).toBeGreaterThanOrEqual(300);
  });
});
