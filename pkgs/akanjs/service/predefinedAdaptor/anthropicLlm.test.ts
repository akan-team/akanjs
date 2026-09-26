import { describe, expect, test } from "bun:test";
import type { LlmTurnRequest } from "akanjs/service";
import { AnthropicLlm } from "./anthropicLlm";

const request: LlmTurnRequest = {
  instructions: "Help edit the project.",
  context: [{ kind: "route", path: "/task" }],
  tools: [
    {
      name: "setPreviewMode",
      description: "Set the preview mode",
      parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
    },
    { name: "refreshTask" },
  ],
  messages: [
    { role: "user", text: "fill the preview" },
    { role: "assistant", text: "", toolCalls: [{ id: "c1", name: "setPreviewMode", args: { value: "fill" } }] },
    {
      role: "tool",
      toolResults: [{ id: "c1", name: "setPreviewMode", changes: [{ name: "previewMode", value: "fill" }] }],
    },
  ],
};

const streamOf = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(new TextEncoder().encode(line));
      controller.close();
    },
  });

describe("AnthropicLlm.requestBody", () => {
  test("puts the system prompt in its own field and always names a ceiling", () => {
    const body = AnthropicLlm.requestBody("claude-opus-5", request);
    expect(body.model).toBe("claude-opus-5");
    expect(body.max_tokens).toBe(AnthropicLlm.defaultMaxTokens);
    expect(body.system).toContain("Help edit the project.");
    expect(body.system).toContain('{"kind":"route","path":"/task"}');
    // The type already forbids a system role here, so the assertion worth making is that it did not leak into a turn.
    expect(JSON.stringify(body.messages)).not.toContain("Help edit the project.");
  });

  test("a tool declares an input_schema, and one with no arguments declares an empty object", () => {
    const body = AnthropicLlm.requestBody("claude-opus-5", request);
    expect(body.tools).toEqual([
      {
        name: "setPreviewMode",
        description: "Set the preview mode",
        input_schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] },
      },
      { name: "refreshTask", input_schema: { type: "object", properties: {} } },
    ]);
  });

  test("a tool call is a block on the assistant turn and its result a block on a user turn", () => {
    const { messages } = AnthropicLlm.requestBody("claude-opus-5", request);
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [{ type: "tool_use", id: "c1", name: "setPreviewMode", input: { value: "fill" } }],
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "c1",
          content: JSON.stringify({ changes: [{ name: "previewMode", value: "fill" }] }),
        },
      ],
    });
  });

  test("two turns that map to one role are merged, since the API takes strict alternation", () => {
    const { messages } = AnthropicLlm.requestBody("claude-opus-5", {
      ...request,
      messages: [...request.messages, { role: "user", text: "now publish it" }, { role: "user", text: "please" }],
    });
    expect(messages).toHaveLength(3);
    expect(messages[2].content).toEqual([
      {
        type: "tool_result",
        tool_use_id: "c1",
        content: JSON.stringify({ changes: [{ name: "previewMode", value: "fill" }] }),
      },
      { type: "text", text: "now publish it" },
      { type: "text", text: "please" },
    ]);
  });

  test("a conversation that opens or ends on the assistant is trimmed to what the API accepts", () => {
    // Both are reachable rather than theoretical: compaction can leave an assistant turn first, and a seeded
    // intro is one. A trailing assistant turn is a prefill to this API, which several models refuse outright.
    const { messages } = AnthropicLlm.requestBody("claude-opus-5", {
      ...request,
      messages: [
        { role: "assistant", text: "Hi, I can help with this screen." },
        { role: "user", text: "fill the preview" },
        { role: "assistant", text: "Done." },
      ],
    });
    expect(messages).toEqual([{ role: "user", content: [{ type: "text", text: "fill the preview" }] }]);
  });

  test("the answer ceiling is the app's, since a reasoning model can spend a fixed one on thinking alone", () => {
    expect(AnthropicLlm.requestBody("claude-opus-5", request).max_tokens).toBe(AnthropicLlm.defaultMaxTokens);
    expect(AnthropicLlm.requestBody("claude-opus-5", request, { maxTokens: 32_000 }).max_tokens).toBe(32_000);
  });

  test("a compaction summary is framed as the history it is, the API having no system turn", () => {
    const { messages } = AnthropicLlm.requestBody("claude-opus-5", {
      ...request,
      messages: [{ role: "user", text: "earlier", summary: true }],
    });
    expect(messages[0].role).toBe("user");
    expect((messages[0].content[0] as { text: string }).text).toContain("Summary of the earlier conversation");
  });
});

describe("AnthropicLlm attachments", () => {
  const asked = (attachments: LlmTurnRequest["messages"][number]["attachments"]): LlmTurnRequest => ({
    context: [],
    tools: [],
    messages: [{ role: "user", text: "what is in this", attachments }],
  });

  test("an image is a block, inline bytes or an address", () => {
    const accepts = { image: true };
    const inline = AnthropicLlm.userContent(
      asked([{ name: "a.png", mimeType: "image/png", data: "QUJD" }]).messages[0],
      accepts,
    );
    expect(inline[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } });
    const linked = AnthropicLlm.userContent(
      asked([{ name: "a.png", mimeType: "image/png", url: "https://cdn/a.png" }]).messages[0],
      accepts,
    );
    expect(linked[1]).toEqual({ type: "image", source: { type: "url", url: "https://cdn/a.png" } });
  });

  test("an image carrying both is read from its bytes, so a display-only address cannot answer for it", () => {
    const both = AnthropicLlm.userContent(
      asked([{ name: "a.png", mimeType: "image/png", data: "QUJD", url: "blob:local/a.png" }]).messages[0],
      { image: true },
    );
    expect(both[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } });
  });

  test("an image type the API does not read is named, not sent — it would refuse the whole request", () => {
    // `image/heic` is the iPhone camera default, and `accepts.image` carries it past AgentService.readable, so
    // this adaptor is the only place left that knows the block vocabulary.
    const blocks = AnthropicLlm.userContent(
      asked([{ name: "IMG_0421.heic", mimeType: "image/heic", data: "QUJD" }]).messages[0],
      { image: true },
    );
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as { text: string }).text).toContain("[Attachment not read: IMG_0421.heic (image/heic)");
  });

  test("a media type carrying parameters still matches, and the block names the essence", () => {
    const blocks = AnthropicLlm.userContent(
      asked([{ name: "a.jpg", mimeType: "image/JPEG; charset=binary", data: "QUJD" }]).messages[0],
      { image: true },
    );
    expect(blocks[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
  });

  test("a pdf is a document block and anything else is named rather than dropped", () => {
    const accepts = { image: true, document: true };
    const pdf = AnthropicLlm.userContent(
      asked([{ name: "spec.pdf", mimeType: "application/pdf", data: "QUJD" }]).messages[0],
      accepts,
    );
    expect(pdf[1]).toMatchObject({ type: "document" });
    // `accepts.document` is one boolean over every non-image type, so the ones with no block say so out loud.
    const other = AnthropicLlm.userContent(
      asked([{ name: "sheet.xlsx", mimeType: "application/vnd.ms-excel", data: "QUJD" }]).messages[0],
      accepts,
    );
    expect(other).toHaveLength(1);
    expect((other[0] as { text: string }).text).toContain("[Attachment not read: sheet.xlsx");
  });

  test("an extracted text attachment is labelled, whatever the provider accepts", () => {
    const blocks = AnthropicLlm.userContent(
      asked([{ name: "spec.md", mimeType: "text/markdown", text: "page one" }]).messages[0],
      { image: true },
    );
    expect(blocks[1]).toEqual({ type: "text", text: "--- attachment: spec.md (text/markdown) ---\npage one" });
  });
});

describe("AnthropicLlm answers", () => {
  test("text blocks join and a tool_use block becomes a wire call", () => {
    expect(
      AnthropicLlm.turnAnswer({
        content: [
          { type: "text", text: "Setting it. " },
          { type: "tool_use", id: "c9", name: "setPreviewMode", input: { value: "fit" } },
        ],
        stop_reason: "tool_use",
      }),
    ).toEqual({
      text: "Setting it. ",
      toolCalls: [{ id: "c9", name: "setPreviewMode", args: { value: "fit" } }],
      stop: "toolUse",
    });
    expect(AnthropicLlm.turnAnswer({ content: [{ type: "text", text: "Done." }], stop_reason: "end_turn" })).toEqual({
      text: "Done.",
      stop: "end",
    });
  });

  test("a max_tokens stop is its own stop, and wins over the calls that did arrive", () => {
    expect(
      AnthropicLlm.turnAnswer({ content: [{ type: "text", text: "Half a sen" }], stop_reason: "max_tokens" }),
    ).toEqual({ text: "Half a sen", stop: "length" });
    expect(
      AnthropicLlm.turnAnswer({
        content: [{ type: "tool_use", id: "c1", name: "refreshTask", input: {} }],
        stop_reason: "max_tokens",
      }).stop,
    ).toBe("length");
  });

  test("a refusal carries the API's own sentence, named by the host that refused", async () => {
    const body = JSON.stringify({ error: { type: "not_found_error", message: "model: claude-nope" } });
    const error = (await AnthropicLlm.refusal(
      "https://api.anthropic.com/v1",
      new Response(body, { status: 404 }),
    )) as Error & { data?: Record<string, string> };
    expect(error.message).toBe("agent.error.llmRequestFailed");
    expect(error.data).toEqual({ provider: "api.anthropic.com", status: "404", reason: "model: claude-nope" });
  });

  test("a prompt past the window is its own refusal, with both counts the API named", async () => {
    const message = "prompt is too long: 213462 tokens > 200000 maximum";
    const body = JSON.stringify({ error: { type: "invalid_request_error", message } });
    const error = (await AnthropicLlm.refusal(
      "https://api.anthropic.com/v1",
      new Response(body, { status: 400 }),
    )) as Error & { data?: Record<string, string | number> };
    expect(error.message).toBe("agent.error.contextOverflow");
    expect(error.data).toEqual({ provider: "api.anthropic.com", limit: 200_000, requested: 213_462 });
  });
});

describe("AnthropicLlm.consumeStream", () => {
  test("reports text deltas in order and assembles a tool call from its json fragments", async () => {
    const deltas: string[] = [];
    const answer = await AnthropicLlm.consumeStream(
      streamOf([
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Set"}}\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ting."}}\n',
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"c1","name":"setPreviewMode"}}\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"value\\":"}}\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"fill\\"}"}}\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n',
      ]),
      (delta) => deltas.push(delta),
    );
    expect(deltas).toEqual(["Set", "ting."]);
    expect(answer).toEqual({
      text: "Setting.",
      toolCalls: [{ id: "c1", name: "setPreviewMode", args: { value: "fill" } }],
      stop: "toolUse",
    });
  });

  test("a stream that ends on the ceiling reports length, keeping the text it had", async () => {
    const answer = await AnthropicLlm.consumeStream(
      streamOf([
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Half a sen"}}\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n',
      ]),
      () => undefined,
    );
    expect(answer).toEqual({ text: "Half a sen", stop: "length" });
  });

  test("a mangled frame costs that frame, not the text already streamed", async () => {
    const answer = await AnthropicLlm.consumeStream(
      streamOf([
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Half"}}\n',
        "data: {not json at all\n",
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" an answer"}}\n',
      ]),
      () => undefined,
    );
    expect(answer).toEqual({ text: "Half an answer", stop: "end" });
  });

  test("an event split across chunks still parses, and a tool with no arguments is an empty object", async () => {
    const answer = await AnthropicLlm.consumeStream(
      streamOf([
        'data: {"type":"content_block_start","index":0,"content_bl',
        'ock":{"type":"tool_use","id":"c2","name":"refreshTask"}}\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n',
      ]),
      () => undefined,
    );
    expect(answer).toEqual({ toolCalls: [{ id: "c2", name: "refreshTask", args: {} }], stop: "toolUse" });
  });
});
