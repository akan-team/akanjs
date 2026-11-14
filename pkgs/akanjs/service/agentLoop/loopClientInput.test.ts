import { afterEach, describe, expect, test } from "bun:test";
import { Err } from "akanjs/dictionary";
import { AgentMeter, type AgentUsageReport } from "../agentMeter";
import { AgentRelayPolicy } from "../agentRelayPolicy";
import type { AgentTool, AgentToolsAdaptor } from "../predefinedAdaptor/agentTools.adaptor";
import type {
  AgentWireMessage,
  AgentWireToolCall,
  AgentWireToolResult,
  LlmTurnRequest,
} from "../predefinedAdaptor/llm.adaptor";
import { AgentLoop, type AgentLoopAnswer, type AgentLoopPort } from "./agentLoop";
import type { AgentLoopCallAnswer, AgentLoopEvent, AgentLoopRequest } from "./agentLoopTypes";
import { LoopRequest } from "./loopRequest";
import { LoopToolOutput } from "./loopToolOutput";

afterEach(() => {
  AgentMeter.use({ usage: null, quota: null, serial: true });
  AgentRelayPolicy.use(null);
});

const usage = { inputTokens: 100, outputTokens: 20, cachedTokens: 0 };
const catalogue: AgentTool[] = [
  { name: "readPage", parameters: {}, readOnly: true },
  { name: "renameTitle", parameters: {}, readOnly: false },
];
const screen = [{ name: "readScreen", description: "Read the open screen", readOnly: true }] as AgentTool[];
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
      called.push(call.id);
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
  const stored: AgentWireMessage[] = [];
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
    messages: [{ role: "user", text: "Look at the screen." }],
    clientTools: screen,
    ...extra,
  }) as AgentLoopRequest;
const failureOf = (events: AgentLoopEvent[]) => {
  expect(events).toHaveLength(1);
  const [event] = events;
  return event?.type === "error" ? event.error : null;
};

describe("AgentLoop client input", () => {
  test("counts a client tool as a write whatever `readOnly` it was sent with", async () => {
    const seen: boolean[] = [];
    const judged = harness([calling(callOf("c1", "readScreen"))]);
    const approve: AgentLoopRequest["approve"] = (_call, { tool }) => {
      seen.push(tool.readOnly);
      return "allow";
    };
    await drain(judged.port, ask({ approve }));
    expect(seen).toEqual([false]);

    const { port } = harness([calling(callOf("c1", "readPage")), calling(callOf("c2", "readScreen")), saying("Ok.")]);
    const { events } = await drain(port, ask({ untrusted: (result) => result.name === "readPage" }));
    expect(events.some((event) => event.type === "awaiting")).toBe(false);
    expect(events).toContainEqual({
      type: "toolResult",
      round: 2,
      result: { id: "c2", name: "readScreen", error: AgentLoop.taintedWrite },
    });
  });

  test("refuses more client tools, or larger ones, than a run takes, with an error a caller can branch on", async () => {
    const many = Array.from({ length: LoopRequest.maxClientTools + 1 }, (_, at) => ({ name: `tool${at}` }));
    const large = [{ name: "fillForm", description: "x".repeat(LoopRequest.maxClientToolChars) }];
    const refused: [unknown[], Record<string, unknown>][] = [
      [many, { limit: "tools", max: 128, sent: 129 }],
      [large, { limit: "chars", max: 200_000 }],
    ];
    for (const [clientTools, data] of refused) {
      const { port, requests } = harness([saying("never")]);
      const { events } = await drain(port, ask({ clientTools: clientTools as AgentTool[] }));
      const failure = failureOf(events);
      expect(Err.is(failure, "agent.error.clientToolsRefused")).toBe(true);
      expect(failure).toMatchObject({ statusCode: 413, data });
      expect(requests).toHaveLength(0);
    }
    const { port, requests } = harness([saying("Ok.")]);
    await drain(port, ask({ clientTools: many.slice(1) as AgentTool[] }));
    expect(requests[0]?.tools).toHaveLength(catalogue.length + LoopRequest.maxClientTools);
  });

  test("clips a client tool's answer where it enters the transcript, judges it whole, and keeps no `url` file", async () => {
    const messages: AgentWireMessage[] = [
      { role: "user", text: "Look at the screen." },
      { role: "assistant", toolCalls: [callOf("c1", "readScreen"), callOf("c2", "renameTitle")] },
    ];
    const answer: AgentLoopCallAnswer = {
      id: "c1",
      result: { source: "page", body: "x".repeat(LoopToolOutput.limit + 1) },
      attachments: [
        { name: "remote", mimeType: "image/png", url: "https://files.example/a.png" },
        { name: "shot", mimeType: "image/png", data: "AAAA", url: "https://files.example/b.png" },
        { name: "notes", mimeType: "text/plain", text: "y".repeat(LoopToolOutput.limit + 1) },
      ],
    };
    const fromPage = (result: AgentWireToolResult) =>
      (result.result as { source?: string } | undefined)?.source === "page";
    const { port, called } = harness([saying("Could not.")]);
    const { stored } = await drain(port, ask({ messages, answer, untrusted: fromPage }));
    const [kept] = stored[0]?.toolResults ?? [];
    expect(stored[0]?.tainted).toBe(true);
    expect(typeof kept?.result).toBe("string");
    expect(String(kept?.result)).toStartWith("[Truncated:");
    expect(kept?.attachments?.map(({ name, url }) => [name, url])).toEqual([
      ["shot", undefined],
      ["notes", undefined],
    ]);
    expect(kept?.attachments?.[1]?.text?.length).toBeLessThan(LoopToolOutput.limit + 400);
    expect(called).toEqual([]);
  });

  test("meets the relay's size caps on a round that lists client tools, and marks the turn `client`", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const messages: AgentWireMessage[] = Array.from(
      { length: AgentRelayPolicy.defaultLimits.messages + 1 },
      (): AgentWireMessage => ({ role: "user", text: "hi" }),
    );
    const capped = harness([saying("never")]);
    const refused = await drain(capped.port, ask({ messages }));
    expect(Err.is(failureOf(refused.events), "agent.error.requestRefused")).toBe(true);
    expect(capped.requests).toHaveLength(0);

    const own = harness([saying("Ok.")]);
    const ran = await drain(own.port, ask({ messages, clientTools: undefined }));
    expect(ran.events.at(-1)).toEqual({ type: "done", stop: "end", rounds: 1 });

    const lent = harness([saying("Ok.")]);
    await drain(lent.port, ask());
    await Bun.sleep(0);
    expect(reports.map((report) => report.turn.loop?.client)).toEqual([undefined, true]);
  });
});
