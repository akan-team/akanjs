import { describe, expect, test } from "bun:test";
import { AgentService } from "./agent.service";
import { AnthropicLlm } from "./predefinedAdaptor/anthropicLlm";
import type { LlmTurnRequest } from "./predefinedAdaptor/llm.adaptor";
import { OpenaiDialect } from "./predefinedAdaptor/openaiDialect";
import { ToolNames } from "./toolNames";

const turn = (): LlmTurnRequest => ({
  tools: [],
  context: [],
  messages: [
    {
      role: "user",
      text: "what do these say?",
      attachments: [
        { name: "shot.png", mimeType: "image/png", data: "AAAA" },
        { name: "spec.pdf", mimeType: "application/pdf", data: "JVBER" },
        { name: "notes.md", mimeType: "text/markdown", text: "# hi" },
        { name: "gone.png", mimeType: "image/png" },
      ],
    },
  ],
});

describe("AgentService.readable", () => {
  test("a text-only provider keeps extracted text and is told about the rest", () => {
    const [message] = AgentService.readable(turn(), undefined).messages;
    expect(message.attachments).toEqual([{ name: "notes.md", mimeType: "text/markdown", text: "# hi" }]);
    expect(message.text).toContain("what do these say?");
    expect(message.text).toContain("Attachment not read: shot.png (image/png)");
    expect(message.text).toContain("Attachment not read: spec.pdf (application/pdf)");
    expect(message.text).toContain("this model cannot read that type");
    expect(message.text).toContain("Attachment not read: gone.png");
    expect(message.text).toContain("no longer available");
  });

  test("a vision provider keeps its images and still loses the document", () => {
    const [message] = AgentService.readable(turn(), { image: true }).messages;
    expect(message.attachments?.map((one) => one.name)).toEqual(["shot.png", "notes.md"]);
    expect(message.text).toContain("Attachment not read: spec.pdf");
    expect(message.text).not.toContain("Attachment not read: shot.png");
  });

  test("an attachment carrying nothing is unreadable however much the provider accepts", () => {
    const [message] = AgentService.readable(turn(), { image: true, document: true }).messages;
    expect(message.attachments?.map((one) => one.name)).toEqual(["shot.png", "spec.pdf", "notes.md"]);
    expect(message.text).toContain("Attachment not read: gone.png");
    expect(message.text).toContain("no longer available");
  });

  test("an attachment naming no type is noted rather than dereferenced, and the message keeps the rest", () => {
    const request = turn();
    request.messages[0].attachments = [
      { name: "photo.heic", mimeType: null as unknown as string, url: "https://cdn.example/photo" },
      { name: "notes.md", mimeType: "text/markdown", text: "# hi" },
    ];
    const [message] = AgentService.readable(request, { image: true, document: true }).messages;
    expect(message.attachments?.map((one) => one.name)).toEqual(["notes.md"]);
    expect(message.text).toContain("Attachment not read: photo.heic");
    expect(message.text).toContain("names no type it could be read as");
  });

  test("a transcript with no attachment is the same object, so the common turn allocates nothing", () => {
    const request: LlmTurnRequest = { tools: [], context: [], messages: [{ role: "user", text: "hi" }] };
    expect(AgentService.readable(request, undefined)).toBe(request);
  });

  test("a file a tool returned that the model cannot read stands as a note where it stood, beside the result", () => {
    const textOnly = AgentService.readable(viewed(), undefined).messages[2].toolResults?.[0];
    expect(textOnly?.result).toBe("Attached card.jpg");
    expect(textOnly?.attachments).toEqual([
      {
        name: "card.jpg",
        mimeType: "image/jpeg",
        text: expect.stringContaining(
          "[Attachment not read: card.jpg (image/jpeg) — this model cannot read that type.",
        ) as unknown as string,
      },
    ]);
    const vision = AgentService.readable(viewed(), { image: true }).messages[2].toolResults?.[0];
    expect(vision?.attachments?.[0]?.data).toBe("QUJD");
  });
});

const viewed = (): LlmTurnRequest => ({
  tools: [],
  context: [],
  messages: [
    { role: "user", text: "what is she wearing?" },
    { role: "assistant", toolCalls: [{ id: "c1", name: "viewImage", args: { src: "/card.jpg" } }] },
    {
      role: "tool",
      toolResults: [
        {
          id: "c1",
          name: "viewImage",
          result: "Attached card.jpg",
          attachments: [{ name: "card.jpg", mimeType: "image/jpeg", data: "QUJD" }],
        },
      ],
    },
  ],
});

describe("a tool's file on the provider wire", () => {
  test("a text-only provider reads the note in the tool message, and is sent no picture", () => {
    const body = OpenaiDialect.requestBody("deepseek-v4", AgentService.readable(viewed(), undefined));
    expect(body.messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(body.messages[3].content).toContain("[Attachment not read: card.jpg (image/jpeg)");
  });

  test("a vision provider is sent the picture, on either dialect", () => {
    const openai = OpenaiDialect.requestBody("gpt-vision", AgentService.readable(viewed(), { image: true }), {
      accepts: { image: true },
    });
    expect(JSON.stringify(openai.messages[4])).toContain("data:image/jpeg;base64,QUJD");
    const [, , results] = AnthropicLlm.providerMessages(AgentService.readable(viewed(), { image: true }).messages, {
      image: true,
    });
    expect(JSON.stringify(results)).toContain('"data":"QUJD"');
  });
});

describe("AgentService.explained", () => {
  test("a failed turn reaches the model as text, since no provider mapping reads `error`", () => {
    const request: LlmTurnRequest = {
      tools: [],
      context: [],
      messages: [
        { role: "user", text: "do it" },
        { role: "assistant", error: "the relay refused the call" },
        { role: "user", text: "again?" },
      ],
    };
    const messages = AgentService.explained(request).messages;
    expect(messages[1]).toEqual({ role: "assistant", text: "[The turn failed: the relay refused the call]" });
    expect(messages[1].error).toBeUndefined();
    expect(messages[0]).toEqual({ role: "user", text: "do it" });
  });

  test("an answer that failed halfway keeps what it did say", () => {
    const request: LlmTurnRequest = {
      tools: [],
      context: [],
      messages: [{ role: "assistant", text: "Looking...", error: "stream ended" }],
    };
    expect(AgentService.explained(request).messages[0].text).toBe("Looking...\n\n[The turn failed: stream ended]");
  });

  test("a transcript with nothing failed is handed on untouched", () => {
    const request = turn();
    expect(AgentService.explained(request)).toBe(request);
  });
});

const pointed = (references: LlmTurnRequest["messages"][number]["references"]): LlmTurnRequest => ({
  tools: [],
  context: [],
  messages: [{ role: "user", text: "make this more dynamic", references }],
});

describe("AgentService.referenced", () => {
  test("a request pointing at nothing is handed back untouched", () => {
    const request = pointed(undefined);
    expect(AgentService.referenced(request)).toBe(request);
  });

  test("the value folds into the message text, under a heading that says it is a snapshot", () => {
    const [message] = AgentService.referenced(
      pointed([
        { refName: "videoCut", refId: "6a1f", label: "Cut 3 body", path: "cutFrames.2.content", value: "a wide shot" },
      ]),
    ).messages;
    expect(message.text).toContain("make this more dynamic");
    expect(message.text).toContain("videoCut/6a1f#cutFrames.2.content (Cut 3 body):");
    expect(message.text).toContain("a wide shot");
    expect(message.text).toContain("not what it is now");
    // Folded into text, which is the one field every provider mapping reads — the wire key itself does not travel.
    expect(message.references).toBeUndefined();
  });

  test("a string value prints as itself, so the model quotes prose rather than an escaped copy of it", () => {
    const [message] = AgentService.referenced(
      pointed([{ refName: "videoCut", refId: "6a1f", label: "Body", path: "c.0.content", value: 'He said "go".' }]),
    ).messages;
    expect(message.text).toContain('He said "go".');
    expect(message.text).not.toContain('\\"go\\"');
  });

  test("an object value prints as indented JSON", () => {
    const [message] = AgentService.referenced(
      pointed([{ refName: "videoCharacter", refId: "c1", label: "Karina", value: { name: "Karina", age: 24 } }]),
    ).messages;
    expect(message.text).toContain('"name": "Karina"');
  });

  test("the heading rides once per message however many things were pointed at", () => {
    const [message] = AgentService.referenced(
      pointed([
        { refName: "videoCut", refId: "6a1f", label: "One", path: "c.0", value: "a" },
        { refName: "videoCut", refId: "6a1f", label: "Two", path: "c.1", value: "b" },
        { refName: "videoCut", refId: "6a1f", label: "Three", path: "c.2", value: "c" },
      ]),
    ).messages;
    expect(message.text?.split("[Referenced data:").length).toBe(2);
    expect(message.text).toContain("(One):");
    expect(message.text).toContain("(Three):");
  });

  test("a multi-line value is fenced, so it cannot run into the next reference's heading", () => {
    const [message] = AgentService.referenced(
      pointed([
        { refName: "videoCut", refId: "6a1f", label: "Cut 3", path: "c.2", value: "a wide shot\nthen a slow pan" },
        { refName: "videoCut", refId: "6a1f", label: "Cut 4", path: "c.3", value: "close on her hands" },
      ]),
    ).messages;
    expect(message.text).toContain("videoCut/6a1f#c.2 (Cut 3):\n```\na wide shot\nthen a slow pan\n```");
    expect(message.text).toContain("videoCut/6a1f#c.3 (Cut 4):\n```\nclose on her hands\n```");
  });

  test("a value that is itself fenced gets a longer fence, rather than ending the block early", () => {
    const [message] = AgentService.referenced(
      pointed([{ refName: "doc", refId: "d1", label: "Body", value: "before\n```\ncode\n```\nafter" }]),
    ).messages;
    expect(message.text).toContain("doc/d1 (Body):\n````\nbefore\n```\ncode\n```\nafter\n````");
  });

  test("a reference with no value is named as unread rather than left for the model to infer", () => {
    const [message] = AgentService.referenced(
      pointed([{ refName: "videoCut", refId: "6a1f", label: "Cut 3", path: "c.2", note: "restored from storage" }]),
    ).messages;
    expect(message.text).toContain("videoCut/6a1f#c.2 (Cut 3): [not read: restored from storage]");
  });

  test("a value past the ceiling is cut here too, so a host that builds its own wire cannot route around it", () => {
    const [message] = AgentService.referenced(
      pointed([
        { refName: "videoCut", refId: "6a1f", label: "All", value: "x".repeat(AgentService.referenceLimit * 2) },
      ]),
    ).messages;
    expect(message.text?.length).toBeLessThan(AgentService.referenceLimit + 1000);
    expect(message.text).toContain(`Clipped at ${AgentService.referenceLimit} characters.`);
  });

  test("a message that points at nothing keeps its own text while a sibling folds", () => {
    const request: LlmTurnRequest = {
      tools: [],
      context: [],
      messages: [
        { role: "user", text: "plain ask" },
        { role: "user", text: "pointed ask", references: [{ refName: "x", refId: "1", label: "L", value: "v" }] },
      ],
    };
    const [plain, folded] = AgentService.referenced(request).messages;
    expect(plain.text).toBe("plain ask");
    expect(folded.text).toContain("x/1 (L):");
  });
});

describe("a reference on the provider wire", () => {
  const asked = (): LlmTurnRequest =>
    AgentService.referenced(
      pointed([
        { refName: "videoCut", refId: "6a1f", label: "Cut 3 body", path: "cutFrames.2.content", value: "a wide shot" },
      ]),
    );

  // Both dialects read the user turn from `text`, so a reference reaches every provider with no adaptor involved.
  test("rides the OpenAI dialect's user turn, text-only provider included", () => {
    const withImages = OpenaiDialect.requestBody("gpt-vision", asked(), { accepts: { image: true } });
    expect(JSON.stringify(withImages.messages[1])).toContain("a wide shot");
    const textOnly = OpenaiDialect.requestBody("deepseek-v4", asked());
    expect(textOnly.messages[1]).toEqual({
      role: "user",
      content: expect.stringContaining("videoCut/6a1f#cutFrames.2.content (Cut 3 body):") as unknown as string,
    });
  });

  test("rides the Anthropic messages body", () => {
    const [message] = AnthropicLlm.providerMessages(asked().messages, { image: true });
    expect(JSON.stringify(message)).toContain("a wide shot");
  });
});

describe("AgentService.instructed", () => {
  const plain = (): LlmTurnRequest => ({ tools: [], context: [], messages: [] });

  test("the app's own instructions follow the framework's, so the app's text is the more specific one", () => {
    const { instructions } = AgentService.instructed({ ...plain(), instructions: "Help edit the project." });
    expect(instructions?.startsWith(AgentService.preamble)).toBe(true);
    expect(instructions?.endsWith("Help edit the project.")).toBe(true);
  });

  test("a turn that says nothing of its own still carries the framework's half", () => {
    expect(AgentService.instructed(plain()).instructions).toBe(AgentService.preamble);
  });

  test("the batching instruction reaches the provider's system prompt", () => {
    const body = OpenaiDialect.requestBody("deepseek-v4-flash", AgentService.instructed(plain()));
    expect(body.messages[0].content).toContain("in the same turn, rather than one call per turn");
  });
});

describe("AgentService tool names on the provider wire", () => {
  // DeepSeek accepted a scope-prefixed name and the model called the bare one, which the browser did not know.
  const zoneTurn = (): LlmTurnRequest => ({
    context: [],
    messages: [{ role: "assistant", toolCalls: [{ id: "c0", name: "videoProjectDraft.readDraft", args: {} }] }],
    tools: [{ name: "videoProjectDraft.createVideoProject", description: "Create it." }, { name: "readScreen" }],
  });

  /** What `runTurn` composes around the tool names, without the adaptor plumbing an instance would need. */
  const prepared = (request: LlmTurnRequest) => {
    const names = ToolNames.of(request);
    return { names, request: names.encode(AgentService.readable(AgentService.explained(request), undefined)) };
  };

  test("every function name the provider is handed is one its schema accepts", () => {
    const body = OpenaiDialect.requestBody("deepseek-chat", prepared(zoneTurn()).request);
    const declared = body.tools?.map((tool) => tool.function.name) ?? [];
    const called = body.messages.flatMap((message) =>
      "tool_calls" in message ? (message.tool_calls ?? []).map((call) => call.function.name) : [],
    );
    expect(declared).toEqual(["videoProjectDraft__createVideoProject", "readScreen"]);
    expect(called).toEqual(["videoProjectDraft__readDraft"]);
    for (const name of [...declared, ...called]) expect(name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  test("a call answered under the renamed tool comes back as the name the surface registered", () => {
    const { names } = prepared(zoneTurn());
    const answered = names.decode([{ id: "c1", name: "videoProjectDraft__createVideoProject", args: {} }]);
    expect(answered[0].name).toBe("videoProjectDraft.createVideoProject");
  });

  test("a turn with no zone leaves the provider body exactly as it was before any of this", () => {
    const flat: LlmTurnRequest = { context: [], messages: [], tools: [{ name: "readScreen" }] };
    expect(prepared(flat).request).toBe(flat);
  });
});
