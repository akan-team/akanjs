import { afterEach, describe, expect, test } from "bun:test";
import { AgentMeter } from "../agentMeter";
import type { AgentTool, AgentToolsAdaptor } from "../predefinedAdaptor/agentTools.adaptor";
import type {
  AgentWireMessage,
  AgentWireToolCall,
  AgentWireToolResult,
  LlmTurnRequest,
} from "../predefinedAdaptor/llm.adaptor";
import { AgentLoop, type AgentLoopAnswer, type AgentLoopPort } from "./agentLoop";
import type { AgentLoopEvent, AgentLoopRequest } from "./agentLoopTypes";

afterEach(() => {
  AgentMeter.use({ usage: null, quota: null, serial: true });
});

const usage = { inputTokens: 100, outputTokens: 20, cachedTokens: 0 };
const catalogue: AgentTool[] = [
  { name: "readPage", parameters: {}, readOnly: true },
  { name: "eventList", parameters: {}, readOnly: true },
];
const screen: AgentTool[] = [
  { name: "fillForm", description: "Fill the open form", parameters: { type: "object" }, readOnly: false },
  { name: "readPage", description: "A screen tool by an endpoint's name", readOnly: true },
  { name: "moveCard", readOnly: false, needsConfirm: true },
];
const callOf = (id: string, name: string, args: Record<string, unknown> = {}): AgentWireToolCall => ({
  id,
  name,
  args,
});
const calling = (...calls: AgentWireToolCall[]): AgentLoopAnswer => ({
  text: "",
  toolCalls: calls,
  stop: "toolUse",
  usage,
});
const saying = (text: string): AgentLoopAnswer => ({ text, toolCalls: [], stop: "end", usage });

const harness = (answers: AgentLoopAnswer[]) => {
  const requests: LlmTurnRequest[] = [];
  const called: string[] = [];
  const tools: AgentToolsAdaptor = {
    listAs: async (_account, caller) => catalogue.filter((tool) => !caller?.allow || caller.allow.includes(tool.name)),
    callAs: async (_account, call) => {
      called.push(call.name);
      return { id: call.id, name: call.name, result: `${call.name}:ok` };
    },
  };
  const port: AgentLoopPort = {
    tools,
    runTurn: async (request) => {
      requests.push(request);
      const next = answers.shift();
      if (!next) throw new Error("the script ran out");
      return next;
    },
  };
  return { port, requests, called };
};

const drain = async (port: AgentLoopPort, request: AgentLoopRequest) => {
  const events: AgentLoopEvent[] = [];
  const stored: AgentWireMessage[] = [...request.messages];
  const run = new AgentLoop(port, {
    ...request,
    onMessage: (message) => {
      stored.push(message);
    },
  } as AgentLoopRequest);
  for await (const event of run.run()) events.push(event);
  return { events, stored };
};
const ask = (extra: Partial<AgentLoopRequest> = {}): AgentLoopRequest =>
  ({
    account: { id: "ann" },
    allow: catalogue.map((tool) => tool.name),
    messages: [{ role: "user", text: "Fill in the form, then check the calendar." }],
    clientTools: screen,
    approve: () => "allow",
    ...extra,
  }) as AgentLoopRequest;
const resultsOf = (events: AgentLoopEvent[]): AgentWireToolResult[] =>
  events.flatMap((event) => (event.type === "toolResult" ? [event.result] : []));

describe("AgentLoop client tools", () => {
  test("lists a screen's tools after the endpoint ones, never under a name the server answers", async () => {
    const { port, requests } = harness([saying("Ok.")]);
    await drain(port, ask({ clientTools: [...screen, { name: "fillForm", readOnly: true, extra: 1 } as AgentTool] }));
    expect(requests[0]?.tools).toEqual([
      { name: "readPage", parameters: {} },
      { name: "eventList", parameters: {} },
      { name: "fillForm", description: "Fill the open form", parameters: { type: "object" }, needsConfirm: false },
      { name: "moveCard", needsConfirm: true },
    ]);
  });

  test("parks at an allowed client call, after the calls before it ran and before the ones after it", async () => {
    const asked: { name: string; readOnly: boolean }[] = [];
    const { port, called } = harness([
      calling(callOf("c1", "readPage"), callOf("c2", "fillForm", { title: "Review" }), callOf("c3", "eventList")),
    ]);
    const { events, stored } = await drain(
      port,
      ask({
        approve: (call, { tool }) => {
          asked.push({ name: call.name, readOnly: tool.readOnly });
          return "allow";
        },
      }),
    );
    expect(called).toEqual(["readPage"]);
    expect(asked).toEqual([
      { name: "readPage", readOnly: true },
      { name: "fillForm", readOnly: false },
      { name: "eventList", readOnly: true },
    ]);
    expect(events.filter((event) => event.type === "awaiting")).toEqual([
      { type: "awaiting", call: callOf("c2", "fillForm", { title: "Review" }), client: true },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", stop: "awaiting", rounds: 1 });
    expect(stored.at(-1)).toEqual({
      role: "tool",
      toolResults: [{ id: "c1", name: "readPage", result: "readPage:ok" }],
      tainted: true,
    });
  });

  test("runs on from the result a caller appended, and parks again when none was", async () => {
    const parked: AgentWireMessage[] = [
      { role: "user", text: "Fill in the form, then check the calendar." },
      { role: "assistant", toolCalls: [callOf("c2", "fillForm"), callOf("c3", "eventList")] },
    ];
    const { port: again } = harness([]);
    const { events: reparked } = await drain(again, ask({ messages: parked }));
    expect(reparked.filter((event) => event.type === "awaiting")).toEqual([
      { type: "awaiting", call: callOf("c2", "fillForm"), client: true },
    ]);
    const answered: AgentWireMessage[] = [
      ...parked,
      { role: "tool", toolResults: [{ id: "c2", name: "fillForm", result: { filled: ["title"] } }] },
    ];
    const { port, called, requests } = harness([saying("Filled and checked.")]);
    const { events } = await drain(port, ask({ messages: answered }));
    expect(called).toEqual(["eventList"]);
    expect(requests[0]?.messages.at(-1)?.toolResults?.map((result) => result.id)).toEqual(["c2", "c3"]);
    expect(events.at(-1)).toEqual({ type: "done", stop: "end", rounds: 1 });
  });

  test("refuses a client call as a write once tainted with no approver, and parks none it refused", async () => {
    const { port } = harness([calling(callOf("c1", "readPage")), calling(callOf("c2", "fillForm")), saying("Ok.")]);
    const { events } = await drain(
      port,
      ask({ approve: undefined, untrusted: (result) => result.name === "readPage" }),
    );
    expect(events.some((event) => event.type === "awaiting")).toBe(false);
    expect(resultsOf(events)[1]?.error).toContain("changes data");
    const { port: confirmPort } = harness([calling(callOf("c1", "moveCard")), saying("Ok.")]);
    const { events: confirmEvents } = await drain(confirmPort, ask({ approve: undefined }));
    expect(resultsOf(confirmEvents)[0]?.error).toContain("confirmation");
  });

  test("answers a parked call as unknown once the page is gone, and refuses malformed client tools", async () => {
    const parked: AgentWireMessage[] = [
      { role: "user", text: "Fill it in." },
      { role: "assistant", toolCalls: [callOf("c2", "fillForm")] },
    ];
    const { port } = harness([saying("The form is not open.")]);
    const { events } = await drain(port, ask({ messages: parked, clientTools: undefined }));
    expect(resultsOf(events)[0]).toMatchObject({ id: "c2", code: "unknownTool" });
    for (const clientTools of [{} as never, [{ name: "" }] as never, [{ name: "x", parameters: "y" }] as never]) {
      const { events: refused } = await drain(harness([]).port, ask({ clientTools }));
      expect(refused).toHaveLength(1);
      expect(refused[0]?.type).toBe("error");
    }
  });
});
