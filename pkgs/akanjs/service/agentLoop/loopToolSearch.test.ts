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
import { LoopToolSearch } from "./loopToolSearch";

afterEach(() => {
  AgentMeter.use({ usage: null, quota: null, serial: true });
});

const usage = { inputTokens: 100, outputTokens: 20, cachedTokens: 0 };
const catalogue: AgentTool[] = [
  { name: "readPage", description: "Read the page", parameters: {}, readOnly: true },
  { name: "eventList", description: "List calendar events", parameters: {}, readOnly: true },
  { name: "updateEvent", description: "Move or rename a calendar event", parameters: {}, readOnly: false },
  { name: "noteList", description: "List meeting notes", parameters: {}, readOnly: true },
  { name: "createTicket", description: "Open a support ticket", parameters: {}, readOnly: false },
  { name: "ticketList", description: "List support tickets", parameters: {}, readOnly: true },
];
const toolkits = {
  calendar: { description: "Read and edit the org calendar", tools: ["eventList", "updateEvent"] },
  notes: { description: "Read meeting notes", tools: ["noteList"] },
  tickets: { description: "Support tickets", tools: ["createTicket", "ticketList"] },
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
    messages: [{ role: "user", text: "Open a ticket about the review." }],
    toolkits,
    ...extra,
  }) as AgentLoopRequest;
const namesOf = (request: LlmTurnRequest | undefined) => request?.tools.map((tool) => tool.name);
const resultsOf = (events: AgentLoopEvent[]): AgentWireToolResult[] =>
  events.flatMap((event) => (event.type === "toolResult" ? [event.result] : []));
const keywords = { createTicket: ["티켓 만들기", "문의"], ticketList: ["티켓 목록"] };

describe("AgentLoop tool search", () => {
  test("ranks closed toolkits' tools by keyword in the asker's language, lists the found ones after the rest", async () => {
    const { port, requests, called } = harness([
      calling(callOf("c1", "findTools", { query: "티켓을 만들어 줘" })),
      calling(callOf("c2", "createTicket")),
      saying("Opened."),
    ]);
    const events = await drain(port, ask({ search: { keywords } }));
    expect(namesOf(requests[0])).toEqual(["readPage", "openToolkit", "findTools"]);
    expect(resultsOf(events)[0]).toEqual({
      id: "c1",
      name: "findTools",
      result: {
        tools: [
          { name: "createTicket", description: "Open a support ticket" },
          { name: "ticketList", description: "List support tickets" },
        ],
      },
    });
    expect(namesOf(requests[1])).toEqual(["readPage", "createTicket", "ticketList", "openToolkit", "findTools"]);
    expect(called).toEqual(["createTicket"]);
  });

  test("ranks by name and description words, a word with an ending matching its stem, and ties in catalogue order", () => {
    const candidates = catalogue.map(({ name, description = "" }) => ({ name, description, keywords: [] }));
    expect(LoopToolSearch.rank("calendar events", candidates)).toEqual(["eventList", "updateEvent"]);
    expect(LoopToolSearch.rank("to do", candidates)).toEqual([]);
    expect(LoopToolSearch.rank("list tickets", candidates)).toEqual([
      "ticketList",
      "eventList",
      "noteList",
      "createTicket",
    ]);
  });

  test("lets rank decide, drops names outside the candidates, and caps a call's limit at search.limit", async () => {
    const seen: string[][] = [];
    const rank = (_query: string, candidates: { name: string }[]) => {
      seen.push(candidates.map((candidate) => candidate.name));
      return ["readPage", "ticketList", "noteList", "eventList"];
    };
    const { port, requests } = harness([
      calling(callOf("c1", "findTools", { query: "anything", limit: 9 })),
      saying("Ok."),
    ]);
    const events = await drain(port, ask({ search: { rank, limit: 2 } }));
    expect(seen).toEqual([["eventList", "updateEvent", "noteList", "createTicket", "ticketList"]]);
    expect(resultsOf(events)[0]?.result).toEqual({
      tools: [
        { name: "ticketList", description: "List support tickets" },
        { name: "noteList", description: "List meeting notes" },
      ],
    });
    expect(namesOf(requests[1])).toEqual(["readPage", "ticketList", "noteList", "openToolkit", "findTools"]);
    expect(requests[0]?.tools.at(-1)?.parameters).toMatchObject({ properties: { limit: { maximum: 2 } } });
  });

  test("never asks approve, counts no tool call and taints nothing, so a write after it runs unasked", async () => {
    const { port, called } = harness([
      calling(callOf("c1", "findTools", { query: "support ticket" })),
      calling(callOf("c2", "createTicket")),
      saying("Opened."),
    ]);
    const events = await drain(port, ask({ search: {}, budget: { toolCalls: 1 } }));
    expect(called).toEqual(["createTicket"]);
    expect(events.at(-1)).toMatchObject({ type: "done", stop: "end" });
  });

  test("answers an empty query with an error, and is no tool at all without search", async () => {
    const { port } = harness([calling(callOf("c1", "findTools", { query: " " })), saying("Ok.")]);
    expect(resultsOf(await drain(port, ask({ search: {} })))[0]).toMatchObject({ code: "invalidArgument" });
    const { port: off, requests } = harness([calling(callOf("c1", "findTools", { query: "ticket" })), saying("Ok.")]);
    const events = await drain(off, ask());
    expect(namesOf(requests[0])).toEqual(["readPage", "openToolkit"]);
    expect(resultsOf(events)[0]).toMatchObject({ code: "unknownTool" });
  });

  test("lists again on resume what stored calls and a summary found, and nothing a failed call named", async () => {
    const stored: AgentWireMessage[] = [
      { role: "user", text: "Earlier, summarized.", summary: true, foundTools: ["noteList"] },
      { role: "assistant", toolCalls: [callOf("c1", "findTools", { query: "ticket" })] },
      {
        role: "tool",
        toolResults: [{ id: "c1", name: "findTools", result: { tools: [{ name: "ticketList", description: "" }] } }],
      },
      { role: "user", text: "And the events?" },
    ];
    const { port, requests } = harness([saying("Here.")]);
    await drain(port, ask({ search: {}, messages: stored }));
    expect(namesOf(requests[0])).toEqual(["readPage", "noteList", "ticketList", "openToolkit", "findTools"]);
    const failed: AgentWireMessage[] = [
      stored[1] as AgentWireMessage,
      { role: "tool", toolResults: [{ id: "c1", name: "findTools", error: "Stopped." }] },
      { role: "user", text: "Go on." },
    ];
    const { port: again, requests: later } = harness([saying("Here.")]);
    await drain(again, ask({ search: {}, messages: failed }));
    expect(namesOf(later[0])).toEqual(["readPage", "openToolkit", "findTools"]);
  });

  test("drops on compaction a found tool the kept messages neither found nor called, and carries the rest", async () => {
    const stored: AgentWireMessage[] = [
      { role: "user", text: "Plan the week." },
      { role: "assistant", toolCalls: [callOf("c1", "findTools", { query: "notes" })] },
      {
        role: "tool",
        toolResults: [{ id: "c1", name: "findTools", result: { tools: [{ name: "noteList", description: "" }] } }],
      },
      { role: "user", text: "And tickets?" },
      { role: "assistant", toolCalls: [callOf("c2", "findTools", { query: "tickets" })] },
      {
        role: "tool",
        toolResults: [{ id: "c2", name: "findTools", result: { tools: [{ name: "ticketList", description: "" }] } }],
      },
    ];
    const { port, requests } = harness([saying("The user is planning the week."), saying("Here.")]);
    const events = await drain(port, ask({ search: {}, messages: stored, compact: { at: 1, keep: 2 } }));
    expect(events.find((event) => event.type === "compacted")).toMatchObject({
      summary: { foundTools: ["ticketList"] },
    });
    expect(namesOf(requests[1])).toEqual(["readPage", "ticketList", "openToolkit", "findTools"]);
  });

  test("refuses a run whose allow names findTools, and a malformed search", async () => {
    for (const request of [
      ask({ search: {}, allow: ["readPage", "findTools"] }),
      ask({ search: { limit: 0 } }),
      ask({ search: { keywords: { createTicket: "티켓" } } as never }),
      ask({ search: { rank: "no" } as never }),
      ask({ listed: "tickets" as never }),
      ask({ toolBudget: -1 }),
      ask({ toolkits: { tickets: { description: "x", tools: ["createTicket"], asked: "yes" } } as never }),
    ]) {
      const events = await drain(harness([]).port, request);
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("error");
    }
  });
});

describe("AgentLoop listed toolkits and tools", () => {
  test("lists a named toolkit and tool from the first round, ignores names the run may not see, and keeps them", async () => {
    const instructed = {
      ...toolkits,
      tickets: { ...toolkits.tickets, instructions: "Quote the ticket number." },
    };
    const { port, requests } = harness([
      calling(callOf("c1", "createTicket")),
      saying("The user opened a ticket."),
      saying("Opened."),
    ]);
    const events = await drain(
      port,
      ask({
        toolkits: instructed,
        allow: catalogue.map((tool) => tool.name).filter((name) => name !== "ticketList"),
        listed: ["tickets", "noteList", "ticketList", "nope"],
        compact: { at: 1, keep: 1 },
      }),
    );
    expect(namesOf(requests[0])).toEqual(["readPage", "createTicket", "noteList", "openToolkit"]);
    expect(requests[0]?.instructions).toEndWith('\n\nToolkit "tickets": Quote the ticket number.');
    const compacted = events.find((event) => event.type === "compacted");
    expect(compacted?.type === "compacted" && compacted.summary.toolkits).toBeUndefined();
    expect(namesOf(requests[2])).toEqual(["readPage", "createTicket", "noteList", "openToolkit"]);
  });

  test("returns a toolkit's instructions with the tools openToolkit lists", async () => {
    const instructed = { ...toolkits, notes: { ...toolkits.notes, instructions: "Cite the meeting date." } };
    const { port, requests } = harness([calling(callOf("c1", "openToolkit", { name: "notes" })), saying("Ok.")]);
    const events = await drain(port, ask({ toolkits: instructed }));
    expect(resultsOf(events)[0]?.result).toEqual({
      opened: "notes",
      tools: ["noteList"],
      instructions: "Cite the meeting date.",
    });
    expect(requests[0]?.instructions).toBe(AgentLoop.noInstructions);
  });
});

describe("AgentLoop toolBudget", () => {
  const sizeOf = (name: string) => {
    const { description, parameters } = catalogue.find((tool) => tool.name === name) as AgentTool;
    return JSON.stringify({ name, description, parameters }).length;
  };

  test("unlists the least recently used loaded tool past the budget, refuses it, and lists it again on open", async () => {
    const toolBudget = sizeOf("eventList") + sizeOf("updateEvent") + sizeOf("noteList") - 1;
    const { port, requests } = harness([
      calling(callOf("c1", "openToolkit", { name: "calendar" })),
      calling(callOf("c2", "openToolkit", { name: "notes" }), callOf("c3", "eventList")),
      calling(callOf("c4", "updateEvent")),
      calling(callOf("c5", "openToolkit", { name: "calendar" })),
      saying("Ok."),
    ]);
    const events = await drain(port, ask({ toolBudget, allow: ["readPage", "eventList", "updateEvent", "noteList"] }));
    expect(namesOf(requests[1])).toEqual(["readPage", "eventList", "updateEvent", "openToolkit"]);
    expect(namesOf(requests[2])).toEqual(["readPage", "eventList", "noteList", "openToolkit"]);
    expect(requests[2]?.tools.at(-1)?.parameters).toMatchObject({ properties: { name: { enum: ["calendar"] } } });
    const refused = resultsOf(events).find((result) => result.id === "c4");
    expect(refused).toMatchObject({ code: "toolkitClosed" });
    expect(refused?.error).toContain(
      'updateEvent was taken off your list to keep it short. Open the "calendar" toolkit again',
    );
    expect(namesOf(requests[4])).toEqual(["readPage", "eventList", "updateEvent", "openToolkit"]);
    expect(requests[4]?.tools.at(-1)?.parameters).toMatchObject({ properties: { name: { enum: ["notes"] } } });
  });

  test("keeps what the last step loaded or called even past the budget", async () => {
    const { port, requests } = harness([calling(callOf("c1", "openToolkit", { name: "calendar" })), saying("Ok.")]);
    await drain(port, ask({ toolBudget: 1 }));
    expect(namesOf(requests[1])).toEqual(["readPage", "eventList", "updateEvent", "openToolkit"]);
  });
});

describe("AgentLoop asked toolkits", () => {
  const asked = { ...toolkits, tickets: { ...toolkits.tickets, asked: true } };

  test("parks an asked toolkit's open on approve's defer, and opens it on the resume approve allows", async () => {
    const heard: { name: string; tool: AgentTool }[] = [];
    const transcript: AgentWireMessage[] = [{ role: "user", text: "Open a ticket." }];
    const { port } = harness([calling(callOf("c1", "openToolkit", { name: "tickets" }))]);
    const events = await drain(port, {
      ...ask({ toolkits: asked, messages: [...transcript] }),
      approve: (call, { tool }) => {
        heard.push({ name: call.name, tool });
        return "defer";
      },
      onMessage: (message) => void transcript.push(message),
    });
    expect(events.at(-2)).toMatchObject({ type: "awaiting", call: { name: "openToolkit", args: { name: "tickets" } } });
    expect(heard[0]).toMatchObject({ name: "openToolkit", tool: { readOnly: false, needsConfirm: true } });
    const { port: resumed, requests } = harness([saying("Ready.")]);
    const later = await drain(resumed, { ...ask({ toolkits: asked, messages: transcript }), approve: () => "allow" });
    expect(resultsOf(later)[0]?.result).toEqual({ opened: "tickets", tools: ["createTicket", "ticketList"] });
    expect(namesOf(requests[0])).toEqual(["readPage", "createTicket", "ticketList", "openToolkit"]);
  });

  test("finds no tool only an unopened asked toolkit holds, nor lists one from a stored result or summary", async () => {
    const gated = {
      mail: { description: "Send mail", tools: ["createTicket", "ticketList"], asked: true },
      desk: { description: "The help desk", tools: ["ticketList"] },
    };
    const seen: string[][] = [];
    const rank = (query: string, candidates: { name: string; description: string; keywords: string[] }[]) => {
      seen.push(candidates.map((candidate) => candidate.name));
      return LoopToolSearch.rank(query, candidates);
    };
    const { port } = harness([calling(callOf("c1", "findTools", { query: "ticket" })), saying("Ok.")]);
    const events = await drain(port, ask({ toolkits: gated, search: { rank }, approve: () => "allow" }));
    expect(seen).toEqual([["ticketList"]]);
    expect(resultsOf(events)[0]?.result).toEqual({
      tools: [{ name: "ticketList", description: "List support tickets" }],
    });
    const stored: AgentWireMessage[] = [
      { role: "user", text: "Earlier, summarized.", summary: true, foundTools: ["createTicket"] },
      { role: "assistant", toolCalls: [callOf("c1", "findTools", { query: "ticket" })] },
      {
        role: "tool",
        toolResults: [{ id: "c1", name: "findTools", result: { tools: [{ name: "createTicket", description: "" }] } }],
      },
      { role: "user", text: "Go on." },
    ];
    const { port: resumed, requests } = harness([saying("Ok.")]);
    await drain(resumed, ask({ toolkits: gated, search: {}, messages: stored, approve: () => "allow" }));
    expect(namesOf(requests[0])).not.toContain("createTicket");
    const opened = [
      { role: "user", text: "Earlier, summarized.", summary: true, toolkits: ["mail"], foundTools: ["createTicket"] },
      { role: "user", text: "Go on." },
    ] as AgentWireMessage[];
    const { port: open, requests: later } = harness([saying("Ok.")]);
    await drain(open, ask({ toolkits: gated, search: {}, messages: opened, approve: () => "allow" }));
    expect(namesOf(later[0])).toContain("createTicket");
  });

  test("answers a denied or unapprovable asked open with the refusal, and never asks about another toolkit", async () => {
    const heard: string[] = [];
    const { port } = harness([
      calling(callOf("c1", "openToolkit", { name: "tickets" }), callOf("c2", "openToolkit", { name: "notes" })),
      saying("Ok."),
    ]);
    const events = await drain(port, {
      ...ask({ toolkits: asked }),
      approve: (call) => {
        heard.push(String(call.args.name));
        return { deny: "Not now." };
      },
    });
    expect(heard).toEqual(["tickets"]);
    expect(resultsOf(events).map((result) => result.error ?? result.result)).toEqual([
      "Not now.",
      { opened: "notes", tools: ["noteList"] },
    ]);
    const { port: unasked } = harness([calling(callOf("c1", "openToolkit", { name: "tickets" })), saying("Ok.")]);
    expect(resultsOf(await drain(unasked, ask({ toolkits: asked })))[0]?.error).toBe(AgentLoop.needsPerson);
  });
});
