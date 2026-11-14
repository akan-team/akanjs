import { afterEach, describe, expect, test } from "bun:test";
import { Err } from "akanjs/dictionary";
import { AgentMeter, type AgentUsageReport } from "../agentMeter";
import type { AgentTool } from "../predefinedAdaptor/agentTools.adaptor";
import type { AgentWireMessage, LlmTurnRequest } from "../predefinedAdaptor/llm.adaptor";
import { AgentLoop, type AgentLoopAnswer, type AgentLoopPort } from "./agentLoop";
import type { AgentLoopEvent, AgentLoopRequest } from "./agentLoopTypes";
import { LoopCompaction } from "./loopCompaction";

afterEach(() => {
  AgentMeter.use({ usage: null, quota: null, serial: true });
});

type Refusal = Record<string, unknown> | null;

const usage = { inputTokens: 100, outputTokens: 20, cachedTokens: 0 };
const catalogue: AgentTool[] = [{ name: "readPage", parameters: {}, readOnly: true }];
const reading = (id: string): AgentLoopAnswer => ({
  text: "",
  toolCalls: [{ id, name: "readPage", args: {} }],
  stop: "toolUse",
  usage,
});
const saying = (text: string): AgentLoopAnswer => ({ text, toolCalls: [], stop: "end", usage });
const summarizing = (request: LlmTurnRequest) => request.instructions === LoopCompaction.instruction;
const sizeOf = (request: LlmTurnRequest) => JSON.stringify(request).length;

const harness = (refuses: (request: LlmTurnRequest) => Refusal, answers: AgentLoopAnswer[], page = "page") => {
  const requests: LlmTurnRequest[] = [];
  const refused: LlmTurnRequest[] = [];
  const port: AgentLoopPort = {
    tools: {
      listAs: async () => catalogue,
      callAs: async (_account, call) => ({ id: call.id, name: call.name, result: page }),
    },
    runTurn: async (request) => {
      requests.push(request);
      const data = refuses(request);
      if (data) {
        refused.push(request);
        throw new Err("agent.error.contextOverflow", { provider: "test", ...data });
      }
      if (summarizing(request)) return saying("notes so far");
      const next = answers.shift();
      if (!next) throw new Error("the script ran out");
      return next;
    },
  };
  return { port, requests, refused };
};

const drain = async (port: AgentLoopPort, request: Partial<AgentLoopRequest>) => {
  const events: AgentLoopEvent[] = [];
  const run = new AgentLoop(port, { account: { id: "ann" }, allow: ["readPage"], ...request } as AgentLoopRequest);
  for await (const event of run.run()) events.push(event);
  return events;
};
const compactions = (events: AgentLoopEvent[]) => events.filter((event) => event.type === "compacted");
const failureOf = (events: AgentLoopEvent[]) => {
  const last = events.at(-1);
  return last?.type === "error" ? last.error : null;
};

const long: AgentWireMessage[] = [
  { role: "user", text: "x".repeat(2_500) },
  { role: "assistant", text: "y".repeat(2_500) },
  { role: "user", text: "z".repeat(2_500) },
  { role: "assistant", text: "w".repeat(2_500) },
  { role: "user", text: "and now?" },
];
const roundsOnly = (request: LlmTurnRequest): Refusal => (summarizing(request) ? null : {});

describe("AgentLoop refusal for length", () => {
  test("a refused round compacts past `at`, is asked again as the same round, and the run finishes", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const { port, requests, refused } = harness(
      (request) => (!summarizing(request) && sizeOf(request) > 8_000 ? {} : null),
      [saying("Here.")],
    );
    const events = await drain(port, { messages: long, compact: { at: 1_000_000, keep: 1 } });
    expect(refused).toHaveLength(1);
    expect(requests.map(summarizing)).toEqual([false, true, false]);
    const summary = LoopCompaction.message("notes so far", false);
    expect(requests[2]?.messages).toEqual([summary, { role: "user", text: "and now?" }]);
    expect(compactions(events)).toEqual([{ type: "compacted", replaced: 4, summary }]);
    expect(events.filter((event) => event.type === "usage")).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: "done", stop: "end", rounds: 1 });
    await Bun.sleep(0);
    expect(reports.map((report) => [report.turn.loop?.round, report.outcome])).toEqual([
      [1, "failed"],
      [1, "ok"],
      [1, "ok"],
    ]);
    expect(reports[0]?.usage).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  test("a request refused again after its summary ends the run with the refusal, without a third try", async () => {
    const { port, requests } = harness(roundsOnly, []);
    const events = await drain(port, { messages: long, compact: { at: 1_000_000, keep: 1 } });
    expect(requests.map(summarizing)).toEqual([false, true, false]);
    expect(compactions(events)).toHaveLength(1);
    expect(Err.is(failureOf(events), "agent.error.contextOverflow")).toBe(true);
  });

  test("a summary refused for length too ends the run with the round's refusal", async () => {
    const { port, requests } = harness(() => ({ limit: 1, requested: 2 }), []);
    const events = await drain(port, { messages: long, compact: { at: 1_000_000, keep: 1 } });
    expect(requests.map(summarizing)).toEqual([false, true]);
    expect(compactions(events)).toEqual([]);
    expect(Err.is(failureOf(events), "agent.error.contextOverflow")).toBe(true);
  });

  test("ends with the refusal as before when nothing can be cut or the run has no `compact`", async () => {
    for (const request of [
      { messages: [{ role: "user", text: "and now?" }], compact: { at: 1_000_000 } },
      { messages: long },
    ] satisfies Partial<AgentLoopRequest>[]) {
      const { port, requests } = harness(roundsOnly, []);
      const events = await drain(port, request);
      expect(requests).toHaveLength(1);
      expect(Err.is(failureOf(events), "agent.error.contextOverflow")).toBe(true);
    }
  });

  test("a refusal that measures itself lowers `at`, so a later round compacts ahead instead of being refused", async () => {
    const cap = 4_500;
    const runOf = async (measured: boolean) => {
      const { port, refused } = harness(
        (request) =>
          !summarizing(request) && sizeOf(request) > cap
            ? measured
              ? { limit: cap, requested: sizeOf(request) }
              : {}
            : null,
        [reading("c1"), reading("c2"), saying("Done.")],
        "p".repeat(2_100),
      );
      const messages: AgentWireMessage[] = [
        { role: "user", text: "x".repeat(5_000) },
        { role: "assistant", text: "ok" },
        { role: "user", text: "go" },
      ];
      const events = await drain(port, { messages, compact: { at: 1_000_000, keep: 1 } });
      return { refused: refused.length, compactions: compactions(events).length, last: events.at(-1) };
    };
    expect(await runOf(true)).toEqual({ refused: 1, compactions: 2, last: { type: "done", stop: "end", rounds: 3 } });
    expect(await runOf(false)).toEqual({ refused: 2, compactions: 2, last: { type: "done", stop: "end", rounds: 3 } });
  });
});
