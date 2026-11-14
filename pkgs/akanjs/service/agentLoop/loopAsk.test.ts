import { afterEach, describe, expect, test } from "bun:test";
import { AgentSession } from "use-agentic";
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
import { LoopAsk } from "./loopAsk";

afterEach(() => {
  AgentMeter.use({ usage: null, quota: null, serial: true });
});

const usage = { inputTokens: 100, outputTokens: 20, cachedTokens: 0 };
const catalogue: AgentTool[] = [
  { name: "readPage", parameters: {}, readOnly: true },
  { name: "eventList", parameters: {}, readOnly: true },
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
const question = { question: "Which calendar?", choices: ["Team", "Personal"] };

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
    messages: [{ role: "user", text: "Check my calendar." }],
    ask: true,
    ...extra,
  }) as AgentLoopRequest;
const resultsOf = (events: AgentLoopEvent[]): AgentWireToolResult[] =>
  events.flatMap((event) => (event.type === "toolResult" ? [event.result] : []));
const awaited = (events: AgentLoopEvent[]) => events.filter((event) => event.type === "awaiting");

describe("AgentLoop askUser", () => {
  test("lists the in-page chat's own askUser last, only when asked to", async () => {
    const { name, description, parameters } = AgentSession.askUserTool;
    expect({
      name: LoopAsk.tool.name,
      description: LoopAsk.tool.description,
      parameters: LoopAsk.tool.parameters,
    }).toEqual({ name, description, parameters });
    const { port, requests } = harness([saying("Ok."), saying("Ok.")]);
    await drain(port, ask());
    await drain(port, ask({ ask: undefined }));
    expect(requests.map((request) => request.tools.map((tool) => tool.name))).toEqual([
      ["readPage", "eventList", "askUser"],
      ["readPage", "eventList"],
    ]);
  });

  test("parks at a question after the calls before it ran, asking no approver and spending no call", async () => {
    const approved: string[] = [];
    const { port, called } = harness([
      calling(callOf("c1", "readPage"), callOf("q1", "askUser", question), callOf("c3", "eventList")),
    ]);
    const { events, stored } = await drain(
      port,
      ask({
        budget: { toolCalls: 1 },
        approve: (call) => {
          approved.push(call.name);
          return "allow";
        },
      }),
    );
    expect(called).toEqual(["readPage"]);
    expect(approved).toEqual(["readPage", "eventList"]);
    expect(awaited(events)).toEqual([{ type: "awaiting", call: callOf("q1", "askUser", question), question: true }]);
    expect(events.at(-1)).toEqual({ type: "done", stop: "awaiting", rounds: 1 });
    expect(stored.at(-1)).toEqual({
      role: "tool",
      toolResults: [{ id: "c1", name: "readPage", result: "readPage:ok" }],
      tainted: true,
    });
  });

  test("answers a call with nothing to ask with an error and runs on", async () => {
    const { port, called } = harness([
      calling(callOf("q1", "askUser", { question: "  " }), callOf("c2", "readPage")),
      saying("Read it."),
    ]);
    const { events } = await drain(port, ask({ budget: { toolCalls: 1 } }));
    expect(awaited(events)).toEqual([]);
    expect(called).toEqual(["readPage"]);
    expect(resultsOf(events)[0]).toEqual({ id: "q1", name: "askUser", error: LoopAsk.noQuestion });
    expect(events.at(-1)).toEqual({ type: "done", stop: "end", rounds: 2 });
  });

  test("runs on from the answer a caller appended, never reading it as untrusted, and parks again with none", async () => {
    const parked: AgentWireMessage[] = [
      { role: "user", text: "Check my calendar." },
      { role: "assistant", toolCalls: [callOf("q1", "askUser", question), callOf("c2", "eventList")] },
    ];
    const { events: reparked } = await drain(harness([]).port, ask({ messages: parked }));
    expect(awaited(reparked)).toEqual([{ type: "awaiting", call: callOf("q1", "askUser", question), question: true }]);

    const seen: string[] = [];
    const answered: AgentWireMessage[] = [
      ...parked,
      { role: "tool", toolResults: [{ id: "q1", name: "askUser", result: "Team" }] },
    ];
    const { port, called, requests } = harness([saying("Team calendar checked.")]);
    const { events, stored } = await drain(
      port,
      ask({
        messages: answered,
        untrusted: (result) => {
          seen.push(result.name);
          return result.name === "askUser";
        },
      }),
    );
    expect(called).toEqual(["eventList"]);
    expect(seen).toEqual(["eventList"]);
    expect(requests[0]?.messages.at(-1)).toMatchObject({ toolResults: [{ id: "q1" }, { id: "c2" }] });
    expect(stored.filter((message) => message.tainted)).toEqual([]);
    expect(events.at(-1)).toEqual({ type: "done", stop: "end", rounds: 1 });
  });

  test("answers a stored question as unknown once the run no longer asks, and keeps the name its own", async () => {
    const parked: AgentWireMessage[] = [
      { role: "user", text: "Check my calendar." },
      { role: "assistant", toolCalls: [callOf("q1", "askUser", question)] },
    ];
    const { events } = await drain(harness([saying("Ok.")]).port, ask({ messages: parked, ask: undefined }));
    expect(resultsOf(events)[0]).toMatchObject({ id: "q1", code: "unknownTool" });

    const page: AgentTool = { name: "askUser", description: "The page's own", readOnly: true };
    const { port, requests } = harness([calling(callOf("q2", "askUser", question))]);
    const { events: asked } = await drain(port, ask({ clientTools: [page] }));
    expect(requests[0]?.tools.filter((tool) => tool.name === "askUser")).toEqual([
      {
        name: "askUser",
        description: LoopAsk.tool.description,
        parameters: LoopAsk.tool.parameters,
        needsConfirm: false,
      },
    ]);
    expect(awaited(asked)).toEqual([{ type: "awaiting", call: callOf("q2", "askUser", question), question: true }]);

    for (const extra of [{ allow: ["readPage", "askUser"] }, { ask: "yes" as never }]) {
      const { events: refused } = await drain(harness([]).port, ask(extra));
      expect(refused).toHaveLength(1);
      expect(refused[0]).toMatchObject({ type: "error" });
    }
  });
});
