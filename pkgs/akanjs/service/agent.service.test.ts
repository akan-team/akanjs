import { describe, expect, test } from "bun:test";
import { AgentService } from "./agent.service";
import { DeepseekLlm } from "./predefinedAdaptor/deepseekLlm";
import type { LlmTurnRequest } from "./predefinedAdaptor/llm.adaptor";
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

  test("a transcript with no attachment is the same object, so the common turn allocates nothing", () => {
    const request: LlmTurnRequest = { tools: [], context: [], messages: [{ role: "user", text: "hi" }] };
    expect(AgentService.readable(request, undefined)).toBe(request);
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

describe("AgentService tool names on the provider wire", () => {
  // The exact shape that failed in an app: a zone's tools are scope-prefixed, DeepSeek did not reject the illegal
  // name, and the model normalized it to the bare one — which the browser answered with `Unknown tool`.
  const zoneTurn = (): LlmTurnRequest => ({
    context: [],
    messages: [{ role: "assistant", toolCalls: [{ id: "c0", name: "videoProjectDraft.readDraft", args: {} }] }],
    tools: [{ name: "videoProjectDraft.createVideoProject", description: "Create it." }, { name: "readScreen" }],
  });

  /** What `runTurn` composes, without the adaptor plumbing an instance would need. */
  const prepared = (request: LlmTurnRequest) => {
    const names = ToolNames.of(request);
    return { names, request: names.encode(AgentService.readable(AgentService.explained(request), undefined)) };
  };

  test("every function name the provider is handed is one its schema accepts", () => {
    const body = DeepseekLlm.requestBody("deepseek-chat", prepared(zoneTurn()).request);
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
