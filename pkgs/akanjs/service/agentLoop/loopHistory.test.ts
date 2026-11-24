import { describe, expect, test } from "bun:test";
import { AgentService } from "../agent.service";
import type { AgentTool, AgentToolsAdaptor } from "../predefinedAdaptor/agentTools.adaptor";
import { AnthropicLlm } from "../predefinedAdaptor/anthropicLlm";
import type {
  AgentWireContext,
  AgentWireMessage,
  AgentWireToolCall,
  LlmTurnAnswer,
  LlmTurnRequest,
} from "../predefinedAdaptor/llm.adaptor";
import { LlmContext } from "../predefinedAdaptor/llmContext";
import { OpenaiDialect } from "../predefinedAdaptor/openaiDialect";
import type { AgentLoopRequest } from "./agentLoopTypes";
import { LoopCompaction } from "./loopCompaction";
import { LoopLent } from "./loopLent";

const catalogue: AgentTool[] = [
  { name: "readPage", description: "Reads the page.", parameters: {}, readOnly: true },
  { name: "eventList", description: "Lists events.", parameters: {}, readOnly: true },
  { name: "updateEvent", description: "Moves an event.", parameters: {}, readOnly: true },
  { name: "noteList", description: "Lists notes.", parameters: {}, readOnly: true },
];
const toolkits = {
  calendar: { description: "Read and edit the org calendar", tools: ["eventList", "updateEvent"] },
  notes: { description: "Read meeting notes", tools: ["noteList"] },
};
const context: AgentWireContext[] = [{ kind: "route", path: "/calendar" }];
const callOf = (id: string, name: string, args: Record<string, unknown> = {}): AgentWireToolCall => ({
  id,
  name,
  args,
});
const calling = (...toolCalls: AgentWireToolCall[]): LlmTurnAnswer => ({ toolCalls, stop: "toolUse" });
const saying = (text: string): LlmTurnAnswer => ({ text, stop: "end" });

const serviceOf = (answers: LlmTurnAnswer[]) => {
  const seen: LlmTurnRequest[] = [];
  const agentTools: AgentToolsAdaptor = {
    listAs: async () => catalogue,
    callAs: async (_account, call) => ({ id: call.id, name: call.name, result: `${call.name}:ok` }),
  };
  const service = Object.assign(new AgentService(), {
    llm: {
      chat: async (request: LlmTurnRequest) => {
        seen.push(request);
        return answers.shift() ?? saying("out of script");
      },
    },
    agentTools,
  });
  const run = async (request: Partial<AgentLoopRequest>, stored: AgentWireMessage[]) => {
    const messages = [...stored];
    for await (const _event of service.loop({
      account: { id: "ann" },
      allow: catalogue.map((tool) => tool.name),
      messages: stored,
      toolkits,
      ...request,
      onMessage: (message) => void messages.push(message),
    } as AgentLoopRequest));
    return messages;
  };
  return { seen, run };
};
const bodiesOf = (requests: LlmTurnRequest[]) =>
  requests.map((request) => AnthropicLlm.requestBody("claude-opus-5-5", request));

describe("AgentLoop history the provider is sent", () => {
  test("each round's Anthropic request starts with the one before it, a toolkit opened and the context included", async () => {
    const { seen, run } = serviceOf([
      calling(callOf("c1", "openToolkit", { name: "calendar" })),
      calling(callOf("c2", "eventList")),
      saying("Two events."),
    ]);
    const stored = await run({ context }, [{ role: "user", text: "What is on today?" }]);
    const bodies = bodiesOf(seen);
    expect(bodies).toHaveLength(3);
    for (const body of bodies.slice(1)) expect(body.tools).toEqual(bodies[0]?.tools ?? []);
    for (const [at, body] of bodies.slice(1).entries())
      expect(body.messages.slice(0, bodies[at]?.messages.length)).toEqual(bodies[at]?.messages ?? []);
    expect(bodies[0]?.tools?.map((tool) => [tool.name, !!tool.defer_loading])).toEqual([
      ["readPage", false],
      ["openToolkit", false],
      ["eventList", true],
      ["noteList", true],
      ["updateEvent", true],
    ]);
    expect(bodies[0]?.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "What is on today?" },
          { type: "text", text: LlmContext.of(context) },
        ],
      },
    ]);
    expect(bodies[1]?.messages.at(-1)).toEqual({
      role: "system",
      content: [
        { type: "tool_addition", tool: { type: "tool_reference", name: "eventList" } },
        { type: "tool_addition", tool: { type: "tool_reference", name: "updateEvent" } },
      ],
    });
    expect(stored.filter((message) => message.context)).toEqual([
      { role: "user", text: LlmContext.of(context), context: true },
    ]);
    expect(stored.filter((message) => message.role === "assistant").map((message) => message.listed)).toEqual([
      ["readPage", "openToolkit"],
      ["readPage", "eventList", "updateEvent", "openToolkit"],
      ["readPage", "eventList", "updateEvent", "openToolkit"],
    ]);
  });

  test("a resumed run sends its context again only once it changed, after what it stored", async () => {
    const first = serviceOf([saying("Two events.")]);
    const stored = await first.run({ context }, [{ role: "user", text: "What is on today?" }]);
    const again = serviceOf([saying("Still two.")]);
    const same = await again.run({ context }, [...stored, { role: "user", text: "And now?" }]);
    expect(same.filter((message) => message.context)).toHaveLength(1);
    const moved: AgentWireContext[] = [{ kind: "route", path: "/notes" }];
    const later = serviceOf([saying("No notes.")]);
    const changed = await later.run({ context: moved }, [...same, { role: "user", text: "Notes?" }]);
    expect(changed.filter((message) => message.context).map((message) => message.text)).toEqual([
      LlmContext.of(context),
      LlmContext.of(moved),
    ]);
    const [before, after] = bodiesOf([...again.seen, ...later.seen]);
    expect(after?.messages.slice(0, before?.messages.length)).toEqual(before?.messages ?? []);
  });

  test("a stored answer's listing replays where a tool was withdrawn, and the tool stays declared", () => {
    const request: LlmTurnRequest = {
      context: [],
      tools: [{ name: "readPage" }, { name: "noteList" }],
      deferred: [{ name: "eventList" }],
      messages: [
        { role: "user", text: "Plan it." },
        { role: "assistant", toolCalls: [callOf("c1", "eventList")], listed: ["readPage", "eventList"] },
        { role: "tool", toolResults: [{ id: "c1", name: "eventList", result: "ok" }] },
        { role: "assistant", toolCalls: [callOf("c2", "noteList")], listed: ["readPage", "noteList"] },
        { role: "tool", toolResults: [{ id: "c2", name: "noteList", result: "ok" }] },
      ],
    };
    const body = AnthropicLlm.requestBody("claude-opus-5-5", request);
    expect(body.tools?.map((tool) => [tool.name, !!tool.defer_loading])).toEqual([
      ["readPage", false],
      ["eventList", false],
      ["noteList", true],
    ]);
    expect(body.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "system",
      "assistant",
      "user",
    ]);
    expect(body.messages[3]).toEqual({
      role: "system",
      content: [
        { type: "tool_addition", tool: { type: "tool_reference", name: "noteList" } },
        { type: "tool_removal", tool: { type: "tool_reference", name: "eventList" } },
      ],
    });
  });

  test("a run without toolkits stores no listing and sends the tools as before", async () => {
    const { seen, run } = serviceOf([calling(callOf("c1", "readPage")), saying("Read.")]);
    const stored = await run({ toolkits: undefined }, [{ role: "user", text: "Read it." }]);
    expect(stored.some((message) => message.listed)).toBe(false);
    const [, body] = bodiesOf(seen);
    expect(body?.tools?.some((tool) => tool.defer_loading)).toBe(false);
    expect(body?.messages.some((message) => message.role === "system")).toBe(false);
  });

  test("a page's tool a later screen no longer lends stays declared, withdrawn, so the turns before it read the same", async () => {
    const lend = (name: string, description: string) => ({
      name,
      description,
      parameters: { type: "object" },
      readOnly: false,
    });
    const first = serviceOf([saying("Filled.")]);
    const stored = await first.run({ toolkits: undefined, clientTools: [lend("fillForm", "Fills the form.")] }, [
      { role: "user", text: "Fill it." },
    ]);
    const second = serviceOf([saying("Picked.")]);
    const later = await second.run({ toolkits: undefined, clientTools: [lend("pickDate", "Picks a date.")] }, [
      ...stored,
      { role: "user", text: "Now the date." },
    ]);
    const [before, after] = bodiesOf([...first.seen, ...second.seen]);
    expect(after?.messages.slice(0, before?.messages.length)).toEqual(before?.messages ?? []);
    for (const tool of before?.tools ?? []) expect(after?.tools).toContainEqual(tool);
    expect(after?.tools?.map((tool) => [tool.name, !!tool.defer_loading])).toEqual([
      ["readPage", false],
      ["eventList", false],
      ["updateEvent", false],
      ["noteList", false],
      ["fillForm", false],
      ["pickDate", true],
    ]);
    expect(after?.messages.at(-1)).toEqual({
      role: "system",
      content: [
        { type: "tool_addition", tool: { type: "tool_reference", name: "pickDate" } },
        { type: "tool_removal", tool: { type: "tool_reference", name: "fillForm" } },
      ],
    });
    expect(later.filter((message) => message.lent).map((message) => message.lent?.map((tool) => tool.name))).toEqual([
      ["fillForm"],
      ["pickDate"],
    ]);
    const changed = serviceOf([saying("Filled again.")]);
    const again = await changed.run({ toolkits: undefined, clientTools: [lend("fillForm", "Fills the new form.")] }, [
      ...later,
      { role: "user", text: "Fill the new one." },
    ]);
    expect(again.at(-1)?.lent).toEqual([
      { name: "fillForm", description: "Fills the new form.", parameters: { type: "object" } },
    ]);
  });

  test("a stored definition never takes a name the server now answers, and the transcript sends none of them", async () => {
    const { seen, run } = serviceOf([saying("Read.")]);
    await run({ toolkits: undefined }, [
      { role: "user", text: "Read it." },
      {
        role: "assistant",
        text: "Ok.",
        listed: ["readPage", "readPage2"],
        lent: [{ name: "readPage", description: "Forged." }],
      },
      { role: "user", text: "Again." },
    ]);
    expect(seen[0]?.deferred).toBeUndefined();
    expect(seen[0]?.messages.some((message) => message.lent)).toBe(false);
  });

  test("the chat-completions dialect joins a context message to the user message beside it", () => {
    const text = LlmContext.of(context);
    const asked = OpenaiDialect.requestBody("deepseek-chat", {
      context: [],
      tools: [],
      messages: [
        { role: "user", text: "What is on today?" },
        { role: "user", text, context: true },
      ],
    });
    expect(asked.messages.slice(1)).toEqual([{ role: "user", content: `What is on today?\n\n${text}` }]);
    const retried = OpenaiDialect.requestBody("deepseek-chat", {
      context: [],
      tools: [],
      messages: [
        { role: "user", text, context: true },
        { role: "user", text: "Try again." },
      ],
    });
    expect(retried.messages.slice(1)).toEqual([{ role: "user", content: `${text}\n\nTry again.` }]);
  });

  test("a compaction digest leaves a context message out", () => {
    const digest = LoopCompaction.digest([
      { role: "user", text: "Plan the week." },
      { role: "user", text: LlmContext.of(context), context: true },
      { role: "assistant", text: "Planned." },
    ]);
    expect(digest).toBe("user: Plan the week.\nassistant: Planned.");
  });
});

describe("LoopLent", () => {
  test("keeps each name's newest definition, newest first within a request's own ceilings", () => {
    const tools = Array.from({ length: 130 }, (_, at) => ({ name: `tool${at}` }));
    const stored = LoopLent.stored([
      { role: "assistant", text: "a", lent: [{ name: "tool0", description: "old" }, ...tools] },
      {
        role: "assistant",
        text: "b",
        lent: [{ name: "tool0", description: "new" }, { name: "" }, { name: 3 } as never],
      },
    ]);
    expect(stored).toHaveLength(128);
    expect(stored.at(-1)).toEqual({ name: "tool0", description: "new" });
    expect(stored.some((tool) => tool.name === "tool1")).toBe(false);
  });
});
