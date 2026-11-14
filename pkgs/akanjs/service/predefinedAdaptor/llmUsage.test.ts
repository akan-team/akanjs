import { describe, expect, test } from "bun:test";
import { Err } from "akanjs/dictionary";
import { AnthropicLlm } from "./anthropicLlm";
import { type AgentWireTool, llmCallSignal } from "./llm.adaptor";
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
  const openai = (lines: string[], tools?: AgentWireTool[]) =>
    OpenaiDialect.consumeStream(streamOf(lines), none, "https://llm.test", tools);
  const anthropic = (lines: string[], tools?: AgentWireTool[]) =>
    AnthropicLlm.consumeStream(streamOf(lines), none, "https://llm.test", tools);
  const writing: AgentWireTool[] = [
    { name: "write", parameters: { type: "object", properties: { body: { type: "string" } } } },
  ];

  test("a gateway's bare [DONE] after a call whose arguments never came is cut, unless the tool takes none", async () => {
    const opened = (fn: object) =>
      `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", tool_calls: [{ index: 0, id: "c1", type: "function", function: fn }] } }] })}`;
    for (const call of [opened({ name: "write", arguments: "" }), opened({ name: "write" })]) {
      expect((await openai([call, "data: [DONE]"], writing)).stop).toBe("length");
      expect((await openai([call, "data: [DONE]"])).stop).toBe("length");
      expect(await openai([call, "data: [DONE]"], [{ name: "write" }])).toEqual({
        toolCalls: [{ id: "c1", name: "write", args: {} }],
        stop: "toolUse",
      });
      expect((await openai([call, finished, "data: [DONE]"], writing)).stop).toBe("toolUse");
    }
    const empty = [{ name: "write", parameters: { type: "object", properties: {} } }];
    expect((await openai([opened({ name: "write", arguments: "" }), "data: [DONE]"], empty)).stop).toBe("toolUse");
  });

  test("an Anthropic message_stop with no stop reason after an argument-less call is cut, unless the tool takes none", async () => {
    const start = `data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "c1", name: "write", input: {} } })}`;
    const blockStop = `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`;
    const messageStop = `data: ${JSON.stringify({ type: "message_stop" })}`;
    expect((await anthropic([start, blockStop, messageStop], writing)).stop).toBe("length");
    expect((await anthropic([start, blockStop, messageStop], [{ name: "write" }])).stop).toBe("toolUse");
    expect((await anthropic([start, blockStop, stopped, messageStop], writing)).stop).toBe("toolUse");
  });

  test("an OpenAI call with no finish reason or [DONE], or arguments that do not parse behind a bare [DONE], is cut", async () => {
    expect((await openai(toolFrame('{"a":1}'))).stop).toBe("length");
    expect((await openai([...toolFrame('{"a":'), "data: [DONE]"])).stop).toBe("length");
    expect((await openai([...toolFrame("[1]"), "data: [DONE]"])).stop).toBe("length");
  });

  test("a finished stream's malformed arguments come back as that call's error, not as a cut turn", async () => {
    const chunk = (choice: object) =>
      `data: ${JSON.stringify({ id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ index: 0, ...choice }] })}`;
    const answer = await openai([
      chunk({
        delta: {
          role: "assistant",
          tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "write", arguments: "" } }],
        },
        finish_reason: null,
      }),
      chunk({ delta: { tool_calls: [{ index: 0, function: { arguments: '{"body": "hi",}' } }] }, finish_reason: null }),
      chunk({ delta: {}, finish_reason: "tool_calls" }),
      "data: [DONE]",
    ]);
    expect(answer.stop).toBe("toolUse");
    expect(answer.toolCalls).toEqual([
      { id: "c1", name: "write", args: {}, argsError: expect.stringContaining("Not run") },
    ]);
    expect((await openai([...toolFrame("[1]"), finished])).toolCalls?.[0]?.argsError).toContain("not an object");
    const ceiling = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] })}`;
    expect((await openai([...toolFrame('{"body": "half'), ceiling, "data: [DONE]"])).stop).toBe("length");
  });

  test("an Anthropic stream that stopped on tool_use hands malformed input back the same way", async () => {
    const answer = await anthropic([
      `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 40, output_tokens: 1 } } })}`,
      ...anthropicToolFrames('{"a":'),
      `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
      `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 12 } })}`,
      `data: ${JSON.stringify({ type: "message_stop" })}`,
    ]);
    expect(answer.stop).toBe("toolUse");
    expect(answer.toolCalls?.[0]).toMatchObject({ id: "c1", name: "write", args: {} });
    expect(answer.toolCalls?.[0]?.argsError).toContain("Not run");
    expect(answer.usage).toMatchObject({ inputTokens: 40, outputTokens: 12 });
    const ceiling = `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "max_tokens" } })}`;
    expect((await anthropic([...anthropicToolFrames('{"a":'), ceiling])).stop).toBe("length");
  });

  test("an OpenAI call that finished is not, a gateway's bare [DONE] and a no-argument call included", async () => {
    expect((await openai([...toolFrame('{"a":1}'), finished])).stop).toBe("toolUse");
    expect((await openai([...toolFrame('{"a":1}'), "data: [DONE]"])).stop).toBe("toolUse");
    expect((await openai([...toolFrame(""), finished])).stop).toBe("toolUse");
  });

  test("an Anthropic call with no stop reason, or arguments that do not parse behind a bare message_stop, is cut", async () => {
    expect((await anthropic(anthropicToolFrames('{"a":1}'))).stop).toBe("length");
    expect(
      (await anthropic([...anthropicToolFrames('{"a":'), `data: ${JSON.stringify({ type: "message_stop" })}`])).stop,
    ).toBe("length");
    expect((await anthropic([...anthropicToolFrames('{"a":1}'), stopped])).stop).toBe("toolUse");
  });

  test("a text answer or an empty body with no terminal event is cut, not finished", async () => {
    const text = `data: ${JSON.stringify({ choices: [{ delta: { content: "half a sen" } }] })}`;
    expect(await openai([text])).toEqual({ text: "half a sen", stop: "length" });
    expect((await openai([])).stop).toBe("length");
    const delta = `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "half" } })}`;
    expect((await anthropic([delta])).stop).toBe("length");
    expect((await anthropic([delta, `data: ${JSON.stringify({ type: "message_stop" })}`])).stop).toBe("end");
  });

  test("parallel calls that omit or reuse an index stay separate, and a repeated id stays one call", async () => {
    const frameOf = (fragment: object) =>
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [fragment] } }] })}`;
    const named = (id: string, args: string) => ({ id, function: { name: "write", arguments: args } });
    const omitted = await openai([frameOf(named("a", '{"x":1}')), frameOf(named("b", '{"y":2}')), finished]);
    expect(omitted.stop).toBe("toolUse");
    expect(omitted.toolCalls).toEqual([
      { id: "a", name: "write", args: { x: 1 } },
      { id: "b", name: "write", args: { y: 2 } },
    ]);
    const repeated = await openai([
      frameOf({ index: 0, ...named("a", '{"x"') }),
      frameOf({ index: 0, id: "a", function: { arguments: ":1}" } }),
      finished,
    ]);
    expect(repeated.toolCalls).toEqual([{ id: "a", name: "write", args: { x: 1 } }]);
  });

  test("interleaved fragments still land on their own call, in index order", async () => {
    const frameOf = (fragment: object) =>
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [fragment] } }] })}`;
    const answer = await openai([
      frameOf({ index: 1, id: "b", function: { name: "second", arguments: '{"b"' } }),
      frameOf({ index: 0, id: "a", function: { name: "first", arguments: '{"a"' } }),
      frameOf({ index: 1, function: { arguments: ":2}" } }),
      frameOf({ index: 0, function: { arguments: ":1}" } }),
      finished,
    ]);
    expect(answer.toolCalls).toEqual([
      { id: "a", name: "first", args: { a: 1 } },
      { id: "b", name: "second", args: { b: 2 } },
    ]);
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

  test("an Anthropic error event keeps the status its type names, and the prompt counts already sent", async () => {
    const failedWith = (type: string) =>
      anthropic([
        "event: message_start",
        `data: ${JSON.stringify({ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 120, output_tokens: 1 } } })}`,
        "event: content_block_delta",
        `data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Half an" } })}`,
        "event: error",
        `data: ${JSON.stringify({ type: "error", error: { type, message: "Something went wrong." } })}`,
      ]).catch((error: unknown) => error);
    const statusOf = async (type: string) => ((await failedWith(type)) as { data?: { status?: string } }).data?.status;
    expect(await statusOf("overloaded_error")).toBe("529");
    expect(await statusOf("rate_limit_error")).toBe("429");
    expect(await statusOf("invalid_request_error")).toBe("400");
    expect(await statusOf("api_error")).toBe("500");
    expect(await statusOf("a_type_not_yet_named")).toBe("500");
    expect(LlmSpend.of(await failedWith("overloaded_error"))).toEqual({
      usage: { inputTokens: 120, outputTokens: LlmSpend.tokensOf("Half an"), cachedTokens: 0, cacheWriteTokens: 0 },
      estimated: true,
    });
  });

  test("an OpenAI-dialect error frame keeps the status its code or type names when it carries no number", async () => {
    const statusOf = async (error: object) =>
      (
        (await openai([`data: ${JSON.stringify({ error })}`]).catch((failure: unknown) => failure)) as {
          data?: { status?: string };
        }
      ).data?.status;
    expect(await statusOf({ message: "Rate limit reached", type: "tokens", code: "rate_limit_exceeded" })).toBe("429");
    expect(await statusOf({ message: "Provider disconnected", code: "server_error" })).toBe("500");
    expect(await statusOf({ message: "Bad request", type: "invalid_request_error", code: null })).toBe("400");
    expect(await statusOf({ message: "Busy", code: "429" })).toBe("429");
    expect(await statusOf({ message: "Odd", code: 0 })).toBe("500");
  });

  test("a prompt-too-long error frame is the same overflow a refused request is", async () => {
    const frame = `data: ${JSON.stringify({ error: { message: "maximum context length is 8000 tokens" } })}`;
    const failure = await openai([frame]).catch((error: unknown) => error);
    expect(Err.is(failure, "agent.error.contextOverflow")).toBe(true);
  });

  test("vLLM's bare error frame fails the turn with its own code, billed at what was streamed", async () => {
    const failure = await openai([
      `data: ${JSON.stringify({ id: "cmpl-1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", content: "Half an" }, finish_reason: null }] })}`,
      `data: ${JSON.stringify({ object: "error", message: "The engine is dead.", type: "InternalServerError", param: null, code: 503 })}`,
      "data: [DONE]",
    ]).catch((error: unknown) => error);
    expect(Err.is(failure, "agent.error.llmRequestFailed")).toBe(true);
    expect((failure as { data?: unknown }).data).toEqual({ provider: "llm.test", status: "503" });
    expect(LlmSpend.of(failure)).toEqual({
      usage: { inputTokens: 0, outputTokens: LlmSpend.tokensOf("Half an"), cachedTokens: 0 },
      estimated: true,
    });
    const overflow = `data: ${JSON.stringify({ object: "error", message: "This model's maximum context length is 4096 tokens.", code: 400 })}`;
    expect(Err.is(await openai([overflow]).catch((error: unknown) => error), "agent.error.contextOverflow")).toBe(true);
  });

  test("a finish_reason of error fails the turn, keeping the counts the provider sent after it", async () => {
    const chunk = (body: object) =>
      `data: ${JSON.stringify({ id: "gen-1", object: "chat.completion.chunk", ...body })}`;
    const content = chunk({
      choices: [{ index: 0, delta: { role: "assistant", content: "Half an" }, finish_reason: null }],
    });
    const counts = chunk({ choices: [], usage: { prompt_tokens: 80, completion_tokens: 4 } });
    const bare = await openai([
      content,
      chunk({ choices: [{ index: 0, delta: { content: "" }, finish_reason: "error" }] }),
      counts,
      "data: [DONE]",
    ]).catch((error: unknown) => error);
    expect(Err.is(bare, "agent.error.llmRequestFailed")).toBe(true);
    expect(LlmSpend.of(bare)).toEqual({ usage: { inputTokens: 80, outputTokens: 4, cachedTokens: 0 } });
    const explained = await openai([
      content,
      chunk({
        error: { code: 502, message: "Provider disconnected" },
        choices: [{ index: 0, delta: { content: "" }, finish_reason: "error" }],
      }),
      "data: [DONE]",
    ]).catch((error: unknown) => error);
    expect((explained as { data?: unknown }).data).toEqual({ provider: "llm.test", status: "502" });
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

describe("llmCallSignal", () => {
  test("a caller's abort stops each call under a reason of its own, which names the caller's as its cause", () => {
    const caller = new AbortController();
    const calls = [llmCallSignal(caller.signal), llmCallSignal(caller.signal)];
    expect(calls.map(({ aborted }) => aborted)).toEqual([false, false]);
    const shutdown = new Error("shutting down");
    caller.abort(shutdown);
    const reasons = calls.map(({ reason }) => reason as DOMException);
    expect(reasons.map(({ name, cause }) => [name, cause])).toEqual([
      ["AbortError", shutdown],
      ["AbortError", shutdown],
    ]);
    expect(reasons[0]).not.toBe(reasons[1]);
    LlmSpend.attach(reasons[0], { model: "m1" });
    expect(LlmSpend.of(reasons[1])).toBeNull();
    expect(LlmSpend.of(shutdown)).toBeNull();
  });

  test("a call made on a signal already aborted is stopped at once, under its own reason too", () => {
    const stopped = llmCallSignal(AbortSignal.abort("left"));
    expect(stopped.aborted).toBe(true);
    expect(stopped.reason).toMatchObject({ name: "AbortError", cause: "left" });
    expect(stopped.reason).not.toBe(llmCallSignal(AbortSignal.abort("left")).reason);
  });

  test("the call's own time limit still reads as a TimeoutError, on a caller's signal that is not aborted", async () => {
    const timeout = AbortSignal.timeout;
    AbortSignal.timeout = () => timeout.call(AbortSignal, 1);
    try {
      const caller = new AbortController();
      const calls = [llmCallSignal(caller.signal), llmCallSignal()];
      const names = () => calls.map(({ reason }) => (reason as DOMException).name);
      await Bun.sleep(20);
      expect(names()).toEqual(["TimeoutError", "TimeoutError"]);
      expect(caller.signal.aborted).toBe(false);
      caller.abort();
      expect(names()).toEqual(["TimeoutError", "TimeoutError"]);
    } finally {
      AbortSignal.timeout = timeout;
    }
  });
});
