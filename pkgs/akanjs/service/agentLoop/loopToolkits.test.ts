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
  { name: "updateEvent", parameters: {}, readOnly: false },
  { name: "noteList", parameters: {}, readOnly: true },
];
const toolkits = {
  calendar: { description: "Read and edit the org calendar", tools: ["eventList", "updateEvent"] },
  notes: { description: "Read meeting notes", tools: ["noteList"] },
};
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
  for await (const event of new AgentLoop(port, request).run()) events.push(event);
  return events;
};
const ask = (extra: Partial<AgentLoopRequest> = {}): AgentLoopRequest =>
  ({
    account: { id: "ann" },
    allow: catalogue.map((tool) => tool.name),
    messages: [{ role: "user", text: "Move the review to Friday." }],
    toolkits,
    ...extra,
  }) as AgentLoopRequest;
const namesOf = (request: LlmTurnRequest | undefined) => request?.tools.map((tool) => tool.name);
const metaOf = (request: LlmTurnRequest | undefined) => request?.tools.find((tool) => tool.name === "openToolkit");
const resultsOf = (events: AgentLoopEvent[]): AgentWireToolResult[] =>
  events.flatMap((event) => (event.type === "toolResult" ? [event.result] : []));

describe("AgentLoop toolkits", () => {
  test("lists the core and openToolkit first, and an opened toolkit's tools from the next round", async () => {
    const { port, requests, called } = harness([
      calling(callOf("c1", "openToolkit", { name: "calendar" })),
      calling(callOf("c2", "eventList")),
      saying("Moved."),
    ]);
    const events = await drain(port, ask());
    expect(namesOf(requests[0])).toEqual(["readPage", "openToolkit"]);
    expect(metaOf(requests[0])?.description).toContain("- calendar: Read and edit the org calendar");
    expect(metaOf(requests[0])?.description).toContain("- notes: Read meeting notes");
    expect(metaOf(requests[0])?.parameters).toMatchObject({ properties: { name: { enum: ["calendar", "notes"] } } });
    expect(namesOf(requests[1])).toEqual(["readPage", "eventList", "updateEvent", "openToolkit"]);
    expect(metaOf(requests[1])?.parameters).toMatchObject({ properties: { name: { enum: ["notes"] } } });
    expect(resultsOf(events)[0]).toEqual({
      id: "c1",
      name: "openToolkit",
      result: { opened: "calendar", tools: ["eventList", "updateEvent"] },
    });
    expect(called).toEqual(["eventList"]);
    expect(events.at(-1)).toEqual({ type: "done", stop: "end", rounds: 3 });
  });

  test("lets allow cap a toolkit, and offers none whose tools the run may not see", async () => {
    const { port, requests } = harness([calling(callOf("c1", "openToolkit", { name: "calendar" })), saying("Ok.")]);
    const events = await drain(port, ask({ allow: ["readPage", "eventList"] }));
    expect(metaOf(requests[0])?.parameters).toMatchObject({ properties: { name: { enum: ["calendar"] } } });
    expect(resultsOf(events)[0]?.result).toEqual({ opened: "calendar", tools: ["eventList"] });
    expect(namesOf(requests[1])).toEqual(["readPage", "eventList"]);
  });

  test("answers a closed toolkit's tool with the toolkit to open, and one outside allow as unknown", async () => {
    const { port, called } = harness([
      calling(callOf("c1", "updateEvent"), callOf("c2", "noteList"), callOf("c3", "openToolkit", { name: "nope" })),
      saying("Ok."),
    ]);
    const events = await drain(port, ask({ allow: ["readPage", "eventList", "updateEvent"] }));
    const [closed, hidden, unknown] = resultsOf(events);
    expect(closed?.code).toBe("toolkitClosed");
    expect(closed?.error).toContain('"calendar" toolkit');
    expect(hidden).toEqual({ id: "c2", name: "noteList", error: "Unknown tool: noteList.", code: "unknownTool" });
    expect(unknown).toMatchObject({ code: "unknownToolkit", error: 'No toolkit named "nope". Open one of: calendar.' });
    expect(called).toEqual([]);
  });

  test("never asks approve about openToolkit and counts it as no tool call", async () => {
    const asked: string[] = [];
    const { port, called } = harness([
      calling(callOf("c1", "openToolkit", { name: "calendar" })),
      calling(callOf("c2", "updateEvent")),
      saying("Moved."),
    ]);
    const events = await drain(
      port,
      ask({
        budget: { toolCalls: 1 },
        approve: (call) => {
          asked.push(call.name);
          return "allow";
        },
      }),
    );
    expect(asked).toEqual(["updateEvent"]);
    expect(called).toEqual(["updateEvent"]);
    expect(events.at(-1)).toMatchObject({ type: "done", stop: "end" });
  });

  test("reopens what stored calls and a summary opened on resume, and not what failed", async () => {
    const stored: AgentWireMessage[] = [
      { role: "user", text: "Earlier, summarized.", summary: true, toolkits: ["notes"] },
      {
        role: "assistant",
        toolCalls: [callOf("c1", "openToolkit", { name: "calendar" }), callOf("c2", "openToolkit", { name: "notes" })],
      },
      {
        role: "tool",
        toolResults: [
          { id: "c1", name: "openToolkit", error: "Stopped." },
          { id: "c2", name: "openToolkit", result: { opened: "notes", tools: ["noteList"] } },
        ],
      },
      { role: "user", text: "And the notes?" },
    ];
    const { port, requests } = harness([saying("Here.")]);
    await drain(port, ask({ messages: stored }));
    expect(namesOf(requests[0])).toEqual(["readPage", "noteList", "openToolkit"]);
    const { port: summaryOnly, requests: fromSummary } = harness([saying("Here.")]);
    await drain(summaryOnly, ask({ messages: [stored[0] as AgentWireMessage, { role: "user", text: "Go on." }] }));
    expect(namesOf(fromSummary[0])).toEqual(["readPage", "noteList", "openToolkit"]);
  });

  test("carries the opened toolkits on a compaction summary", async () => {
    const { port, requests } = harness([
      calling(callOf("c1", "openToolkit", { name: "calendar" })),
      saying("The user asked to move the review."),
      saying("Moved."),
    ]);
    const events = await drain(port, ask({ compact: { at: 1, keep: 1 } }));
    const compacted = events.find((event) => event.type === "compacted");
    expect(compacted?.type === "compacted" && compacted.summary.toolkits).toEqual(["calendar"]);
    expect(namesOf(requests[2])).toEqual(["readPage", "eventList", "updateEvent", "openToolkit"]);
  });

  test("lists every tool and no openToolkit without toolkits, and refuses a run whose allow names one", async () => {
    const { port, requests } = harness([saying("Ok.")]);
    await drain(port, ask({ toolkits: undefined }));
    expect(namesOf(requests[0])).toEqual(catalogue.map((tool) => tool.name));
    for (const request of [
      ask({ allow: ["readPage", "openToolkit"] }),
      ask({ toolkits: { calendar: { description: "x", tools: "eventList" } } as never }),
      ask({ toolkits: [] as never }),
    ]) {
      const events = await drain(harness([]).port, request);
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("error");
    }
  });
});
