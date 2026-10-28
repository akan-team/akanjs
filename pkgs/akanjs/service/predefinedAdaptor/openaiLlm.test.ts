import { afterEach, describe, expect, test } from "bun:test";
import type { LlmOption, LlmTurnRequest } from "akanjs/service";
import { OpenaiDialect } from "./openaiDialect";
import { OpenaiLlm } from "./openaiLlm";

const shot = { name: "shot.png", mimeType: "image/png", data: "QUJD" };

const asked = (attachments: LlmTurnRequest["messages"][number]["attachments"]): LlmTurnRequest => ({
  context: [],
  tools: [],
  messages: [{ role: "user", text: "what is in this", attachments }],
});

describe("OpenaiLlm content parts", () => {
  test("an image rides as its own part once the provider says it reads one", () => {
    const body = OpenaiDialect.requestBody("gpt-vision", asked([shot]), { accepts: { image: true } });
    expect(body.messages[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "what is in this" },
        { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
      ],
    });
  });

  test("a url carrier is handed over as the address, not re-encoded", () => {
    const stored = { name: "hero.jpg", mimeType: "image/jpeg", url: "https://cdn/hero.jpg" };
    const body = OpenaiDialect.requestBody("gpt-vision", asked([stored]), { accepts: { image: true } });
    expect(body.messages[1]).toMatchObject({
      content: [
        { type: "text", text: "what is in this" },
        { type: "image_url", image_url: { url: "https://cdn/hero.jpg" } },
      ],
    });
  });

  test("an image carrying both is read from its bytes, so a display-only address cannot answer for it", () => {
    const both = { name: "shot.png", mimeType: "image/png", data: "QUJD", url: "blob:local/shot.png" };
    const body = OpenaiDialect.requestBody("gpt-vision", asked([both]), { accepts: { image: true } });
    expect(body.messages[1]).toMatchObject({
      content: [
        { type: "text", text: "what is in this" },
        { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
      ],
    });
  });

  test("a text attachment stays labelled in the text part beside the image", () => {
    const spec = { name: "spec.md", mimeType: "text/markdown", text: "page one" };
    const body = OpenaiDialect.requestBody("gpt-vision", asked([spec, shot]), { accepts: { image: true } });
    const parts = body.messages[1].content as { type: string; text?: string }[];
    expect(parts[0].text).toBe("what is in this\n\n--- attachment: spec.md (text/markdown) ---\npage one");
    expect(parts[1].type).toBe("image_url");
  });

  test("an image type the API does not read is named in the text, not sent as a part", () => {
    const body = OpenaiDialect.requestBody(
      "gpt-vision",
      asked([{ name: "IMG_0421.heic", mimeType: "image/heic", data: "QUJD" }]),
      { accepts: { image: true } },
    );
    expect(body.messages[1]).toEqual({
      role: "user",
      content:
        "what is in this\n\n[Attachment not read: IMG_0421.heic (image/heic) — this API reads no image of that type.]",
    });
  });

  test("with no accepts the turn is one string, exactly as the text-only default sends it", () => {
    const body = OpenaiDialect.requestBody("deepseek-v4-flash", asked([shot]));
    expect(body.messages[1]).toEqual({ role: "user", content: "what is in this" });
  });

  test("a message with no image is one string even where images are accepted", () => {
    const body = OpenaiDialect.requestBody("gpt-vision", asked([]), { accepts: { image: true } });
    expect(body.messages[1]).toEqual({ role: "user", content: "what is in this" });
  });
});

describe("OpenaiLlm refusals", () => {
  test("carries the provider's own sentence, named by the host that refused", async () => {
    const body = JSON.stringify({ error: { message: "Incorrect API key provided" } });
    const error = (await OpenaiLlm.refusal(OpenaiLlm.defaultHost, new Response(body, { status: 401 }))) as Error & {
      data?: Record<string, string>;
    };
    expect(error.message).toBe("agent.error.llmRequestFailed");
    expect(error.data).toEqual({ provider: "api.openai.com", status: "401", reason: "Incorrect API key provided" });
  });

  test("a prompt past the window is its own refusal, named by the gateway and the window it gave", async () => {
    const body = JSON.stringify({ error: { message: "This model's maximum context length is 65536 tokens" } });
    const error = (await OpenaiLlm.refusal(
      "https://api.deepseek.com",
      new Response(body, { status: 400 }),
    )) as Error & {
      data?: Record<string, string | number>;
    };
    expect(error.message).toBe("agent.error.contextOverflow");
    expect(error.data).toEqual({ provider: "api.deepseek.com", limit: 65_536 });
  });

  test("a body that is not the dialect's JSON falls back to the status line", async () => {
    const error = (await OpenaiLlm.refusal(
      OpenaiLlm.defaultHost,
      new Response("<html>gateway</html>", { status: 502 }),
    )) as Error & { data?: Record<string, string> };
    expect(error.data?.status).toBe("502");
    expect(error.data?.reason).toBeTruthy();
  });
});

// Per host, not per class: undecodable bytes kill the whole turn, where text-only degrades them to a note.
describe("OpenaiLlm vision claim", () => {
  const acceptsOf = (llmOption: LlmOption) => Object.assign(new OpenaiLlm(), { llmOption }).accepts;

  test("the default host reads images", () => {
    expect(acceptsOf({ apiKey: "k", model: "gpt-vision" })).toEqual({ image: true });
  });

  test("a named host is text-only until the app says otherwise", () => {
    expect(acceptsOf({ apiKey: "k", model: "deepseek-v4-flash", host: "https://api.deepseek.com" })).toBeUndefined();
  });

  test("OpenAI's own endpoint named outright is still the default host", () => {
    expect(acceptsOf({ apiKey: "k", model: "gpt-vision", host: "https://api.openai.com/v1" })).toEqual({ image: true });
    expect(OpenaiLlm.acceptsOf({ host: "https://api.openai.com/v1/" })).toEqual({ image: true });
    expect(OpenaiLlm.acceptsOf({ host: "https://openai.example.com/v1" })).toBeUndefined();
  });

  test("a declared accepts wins over both", () => {
    expect(acceptsOf({ apiKey: "k", model: "gpt-text", accepts: { image: false } })).toEqual({ image: false });
    expect(acceptsOf({ apiKey: "k", model: "m", host: "https://gw", accepts: { image: true } })).toEqual({
      image: true,
    });
  });
});

describe("OpenaiLlm turn model", () => {
  const originalFetch = globalThis.fetch;
  const sent: string[] = [];
  afterEach(() => {
    globalThis.fetch = originalFetch;
    sent.length = 0;
  });

  const llmOf = (llmOption: LlmOption) => {
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { model: string; stream?: boolean };
      sent.push(body.model);
      if (!body.stream) return Response.json({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] });
      return new Response('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    }) as unknown as typeof fetch;
    return Object.assign(new OpenaiLlm(), { llmOption });
  };
  const turn: LlmTurnRequest = { context: [], tools: [], messages: [{ role: "user", text: "hi" }] };

  test("a turn's own model is sent and reported, streamed or not", async () => {
    const llm = llmOf({ apiKey: "k", model: "model-a" });
    expect((await llm.chat({ ...turn, model: "model-b" }))?.model).toBe("model-b");
    expect((await llm.chat({ ...turn, model: "model-b" }, () => undefined))?.model).toBe("model-b");
    expect(sent).toEqual(["model-b", "model-b"]);
  });

  test("a turn naming none, or an empty one, runs on the option's model", async () => {
    const llm = llmOf({ apiKey: "k", model: "model-a" });
    expect((await llm.chat(turn))?.model).toBe("model-a");
    expect((await llm.chat({ ...turn, model: "" }))?.model).toBe("model-a");
    expect(sent).toEqual(["model-a", "model-a"]);
  });

  test("a turn's model answers even where the option names none", async () => {
    expect((await llmOf({ apiKey: "k" }).chat({ ...turn, model: "model-b" }))?.model).toBe("model-b");
  });
});
