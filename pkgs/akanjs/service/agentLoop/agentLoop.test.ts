import { afterEach, describe, expect, test } from "bun:test";
import { Err } from "akanjs/dictionary";
import { AgentService } from "../agent.service";
import { AgentAccounts } from "../agentAccounts";
import { AgentMeter, type AgentUsageReport } from "../agentMeter";
import { AgentRelayPolicy, type AgentTurnContext } from "../agentRelayPolicy";
import type { AgentTool, AgentToolsAdaptor, AgentToolsCaller } from "../predefinedAdaptor/agentTools.adaptor";
import type {
  AgentWireMessage,
  AgentWireToolCall,
  AgentWireToolResult,
  LlmTurnRequest,
} from "../predefinedAdaptor/llm.adaptor";
import { AgentLoop, type AgentLoopAnswer, type AgentLoopPort } from "./agentLoop";
import type { AgentLoopEvent, AgentLoopRequest } from "./agentLoopTypes";
import { LoopCompaction } from "./loopCompaction";
import { LoopToolOutput } from "./loopToolOutput";
import { LoopTranscript } from "./loopTranscript";

afterEach(() => {
  AgentMeter.use({ usage: null, quota: null, serial: true });
  AgentRelayPolicy.use(null);
  AgentAccounts.use(null);
});

type TurnOptions = Parameters<AgentLoopPort["runTurn"]>[1];
type Scripted = AgentLoopAnswer | ((request: LlmTurnRequest, options: TurnOptions) => Promise<AgentLoopAnswer>);

const usage = { inputTokens: 100, outputTokens: 20, cachedTokens: 0 };
const ann = { id: "ann" };
const catalogue: AgentTool[] = [
  { name: "readPage", parameters: {}, readOnly: true },
  { name: "renameTitle", parameters: {}, readOnly: false },
  { name: "deleteAll", parameters: {}, readOnly: false, needsConfirm: true },
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
const saying = (text: string): AgentLoopAnswer => ({ text, toolCalls: [], stop: "end", usage, model: "m1" });

const harness = (answers: Scripted[], run?: (account: unknown, call: AgentWireToolCall) => AgentWireToolResult) => {
  const requests: LlmTurnRequest[] = [];
  const options: TurnOptions[] = [];
  const called: { account: unknown; call: AgentWireToolCall; caller?: AgentToolsCaller }[] = [];
  const listed: unknown[] = [];
  const tools: AgentToolsAdaptor = {
    listAs: async (account, caller) => {
      listed.push(account);
      return catalogue.filter((tool) => !caller?.allow || caller.allow.includes(tool.name));
    },
    callAs: async (account, call, caller) => {
      called.push({ account, call, ...(caller ? { caller } : {}) });
      return run?.(account, call) ?? { id: call.id, name: call.name, result: `${call.name}:ok` };
    },
  };
  const port: AgentLoopPort = {
    tools,
    runTurn: async (request, turnOptions) => {
      requests.push(request);
      options.push(turnOptions);
      const next = answers.shift();
      if (!next) throw new Error("the script ran out");
      return typeof next === "function" ? await next(request, turnOptions) : next;
    },
  };
  return { port, requests, options, called, listed };
};

const drain = async (port: AgentLoopPort, request: AgentLoopRequest) => {
  const events: AgentLoopEvent[] = [];
  for await (const event of new AgentLoop(port, request).run()) events.push(event);
  const terminal = events.filter((event) => event.type === "done" || event.type === "error");
  expect(terminal).toHaveLength(1);
  expect(events.at(-1)).toBe(terminal[0] as AgentLoopEvent);
  return events;
};
const stopOf = (events: AgentLoopEvent[]) => {
  const last = events.at(-1);
  return last?.type === "done" ? last.stop : last?.type;
};
const ask = (text: string, extra: Partial<AgentLoopRequest> = {}): AgentLoopRequest =>
  ({
    account: ann,
    allow: catalogue.map((tool) => tool.name),
    messages: [{ role: "user", text }],
    ...extra,
  }) as AgentLoopRequest;

describe("AgentLoop rounds", () => {
  test("runs the model and the tools until it answers, handing each message over before it acts on it", async () => {
    const { port, requests, called } = harness([calling(callOf("c1", "readPage", { page: 1 })), saying("Done.")]);
    const stored: AgentWireMessage[] = [];
    const events = await drain(port, ask("read it", { onMessage: (message) => void stored.push(message) }));
    expect(stopOf(events)).toBe("end");
    expect(events.at(-1)).toEqual({ type: "done", stop: "end", rounds: 2 });
    expect(stored).toEqual([
      { role: "assistant", toolCalls: [callOf("c1", "readPage", { page: 1 })] },
      { role: "tool", toolResults: [{ id: "c1", name: "readPage", result: "readPage:ok" }] },
      { role: "assistant", text: "Done." },
    ]);
    expect(called.map(({ account, caller }) => [account, caller?.allow])).toEqual([
      [ann, catalogue.map((t) => t.name)],
    ]);
    expect(requests[1]?.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(requests[0]?.tools.map((tool) => tool.name)).toEqual(["readPage", "renameTitle", "deleteAll"]);
    expect(requests[0]?.tools.some((tool) => "readOnly" in tool)).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["usage", "toolCall", "toolResult", "text", "usage", "done"]);
  });

  test("streams the model's deltas as they arrive, and an unstreamed answer as one text event", async () => {
    const streamed: Scripted = async (_request, options) => {
      options.onDelta?.("Hel");
      await Bun.sleep(1);
      options.onDelta?.("lo");
      return saying("Hello");
    };
    const texts = (events: AgentLoopEvent[]) => events.flatMap((event) => (event.type === "text" ? [event.delta] : []));
    expect(texts(await drain(harness([streamed]).port, ask("hi")))).toEqual(["Hel", "lo"]);
    expect(texts(await drain(harness([saying("Hello")]).port, ask("hi")))).toEqual(["Hello"]);
  });

  test("leaves the preamble out unless one is given, and passes instructions, context and model through", async () => {
    const seen: unknown[][] = [];
    const service = Object.assign(new AgentService(), {
      llm: {
        chat: async (...args: unknown[]) => {
          seen.push(args);
          return { text: "ok", stop: "end" as const };
        },
      },
      agentTools: harness([]).port.tools,
    });
    const run = async (request: AgentLoopRequest) => {
      for await (const _event of service.loop(request));
      return seen.at(-1)?.[0] as LlmTurnRequest;
    };
    const context = [{ kind: "org", name: "acme" }];
    const plain = await run(ask("hi", { instructions: "Be brief.", context, model: "m2" }));
    expect(plain.instructions).toBe("Be brief.");
    expect(plain.context).toEqual(context);
    expect(plain.model).toBe("m2");
    expect((await run(ask("hi", { preamble: "You run tasks." }))).instructions).toBe("You run tasks.");
  });

  test("ends on a length cut with only its text kept, and at maxRounds before another model call", async () => {
    const cut = harness([{ text: "partial", toolCalls: [callOf("c1", "readPage")], stop: "length" }]);
    const stored: AgentWireMessage[] = [];
    const events = await drain(cut.port, ask("go", { onMessage: (message) => void stored.push(message) }));
    expect(stopOf(events)).toBe("length");
    expect(stored).toEqual([{ role: "assistant", text: "partial" }]);
    expect(cut.called).toHaveLength(0);

    const busy = harness([calling(callOf("c1", "readPage")), calling(callOf("c2", "readPage"))]);
    expect(await drain(busy.port, ask("go", { maxRounds: 2 }))).toContainEqual({
      type: "done",
      stop: "maxRounds",
      rounds: 2,
    });
    expect(busy.requests).toHaveLength(2);
    expect(busy.called).toHaveLength(2);
  });

  test("clips a tool result where it enters the transcript", async () => {
    const huge = { data: "x".repeat(LoopToolOutput.limit * 2) };
    const { port, requests } = harness([calling(callOf("c1", "readPage")), saying("ok")], (_account, call) => ({
      id: call.id,
      name: call.name,
      result: huge,
    }));
    const events = await drain(port, ask("go"));
    const result = events.find((event) => event.type === "toolResult");
    expect(String(result?.type === "toolResult" && result.result.result).startsWith("[Truncated")).toBe(true);
    expect(JSON.stringify(requests[1]?.messages).length).toBeLessThan(LoopToolOutput.limit * 1.5);
  });

  test("a failure that is not a stop ends the run with one error event", async () => {
    const failing: Scripted = async () => {
      throw new Err("agent.error.llmUnavailable");
    };
    const events = await drain(harness([failing]).port, ask("go"));
    expect(events).toEqual([
      {
        type: "error",
        message: expect.any(String),
        error: expect.objectContaining({ error: "agent.error.llmUnavailable" }),
      },
    ]);
  });
});

describe("AgentLoop metering", () => {
  test("meters each round as its own turn: fresh ids, one loop id, the request's meta, no headers or ip", async () => {
    const reports: AgentUsageReport[] = [];
    const policies: AgentTurnContext[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    AgentRelayPolicy.use((request, context) => {
      policies.push(context);
      return request;
    });
    const meta = { org: "acme", agentRun: "r1" };
    const { port } = harness([calling(callOf("c1", "readPage")), saying("Done.")]);
    await drain(port, ask("go", { meta }));
    await Bun.sleep(0);
    const [first, second] = reports.map((report) => report.turn);
    expect(reports).toHaveLength(2);
    expect(first?.id).not.toBe(second?.id);
    expect(first?.loop?.id).toBe(second?.loop?.id as string);
    expect([first?.loop?.round, second?.loop?.round]).toEqual([1, 2]);
    expect(first?.meta).toEqual(meta);
    expect(second?.meta).toEqual(meta);
    expect(first?.meta).not.toBe(meta);
    expect([...(first?.headers.keys() ?? [])]).toEqual([]);
    expect([first?.ip, first?.account]).toEqual([null, ann]);
    expect(reports.map((report) => report.outcome)).toEqual(["ok", "ok"]);
    expect(policies.map((context) => context.id)).toEqual([first?.id, second?.id]);
  });

  test("skips the browser's size caps on a loop round, and still caps a relayed turn", async () => {
    const oversized: LlmTurnRequest = {
      messages: [],
      tools: Array.from({ length: AgentRelayPolicy.defaultLimits.tools + 1 }, (_, at) => ({ name: `t${at}` })),
      context: [],
    };
    const turn = AgentMeter.turnOf(ann);
    await expect(AgentRelayPolicy.apply(oversized, turn)).rejects.toThrow();
    expect(await AgentRelayPolicy.apply(oversized, { ...turn, loop: { id: "l1", round: 1 } })).toBe(oversized);
  });

  test("a quota that refuses a round stops the run as quota", async () => {
    AgentMeter.use({ quota: () => false });
    const { port, requests } = harness([saying("never")]);
    expect(stopOf(await drain(port, ask("go")))).toBe("quota");
    expect(requests).toHaveLength(0);
  });

  test("stops on the token budget before the next round, and on the tool-call budget before the next call", async () => {
    const tokens = harness([calling(callOf("c1", "readPage")), saying("never")]);
    expect(stopOf(await drain(tokens.port, ask("go", { budget: { tokens: 100 } })))).toBe("budget");
    expect(tokens.requests).toHaveLength(1);
    expect(tokens.called).toHaveLength(1);

    const calls = harness([calling(callOf("c1", "readPage"), callOf("c2", "readPage"), callOf("c3", "readPage"))]);
    const stored: AgentWireMessage[] = [];
    const request = ask("go", { budget: { toolCalls: 2 }, onMessage: (message) => void stored.push(message) });
    expect(stopOf(await drain(calls.port, request))).toBe("budget");
    expect(calls.called.map(({ call }) => call.id)).toEqual(["c1", "c2"]);
    expect(stored.at(-1)?.toolResults?.map((result) => result.id)).toEqual(["c1", "c2"]);
    expect(LoopTranscript.pending([...request.messages, ...stored]).map((call) => call.id)).toEqual(["c3"]);
  });

  test("the wall-clock budget aborts the model call in flight and reports it as aborted", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const hanging: Scripted = (_request, options) =>
      new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(stopOf(await drain(harness([hanging]).port, ask("go", { budget: { wallMs: 5 } })))).toBe("budget");
    await Bun.sleep(0);
    expect(reports.map((report) => report.outcome)).toEqual(["aborted"]);
  });

  test("an abort from the caller stops the run as aborted, and so does a consumer that stops reading", async () => {
    const abort = new AbortController();
    const hanging: Scripted = (_request, options) => {
      abort.abort();
      return new Promise((_resolve, reject) => {
        if (options.signal.aborted) reject(new Error("aborted"));
      });
    };
    expect(stopOf(await drain(harness([hanging]).port, ask("go", { signal: abort.signal })))).toBe("aborted");

    let signal: AbortSignal | undefined;
    const streaming: Scripted = (_request, options) => {
      signal = options.signal;
      options.onDelta?.("Hel");
      return new Promise(() => undefined);
    };
    for await (const event of new AgentLoop(harness([streaming]).port, ask("go")).run())
      if (event.type === "text") break;
    expect(signal?.aborted).toBe(true);
  });
});

describe("AgentLoop accounts", () => {
  test("resolves a principal before every round, and stops as unauthorized once it resolves to null", async () => {
    const resolved: string[] = [];
    let live = true;
    AgentAccounts.use((principal) => {
      resolved.push(principal);
      return live ? { id: principal } : null;
    });
    const { port, called, listed, requests } = harness([
      async () => {
        live = false;
        return calling(callOf("c1", "readPage"));
      },
      saying("never"),
    ]);
    const request = { ...ask("go"), account: undefined, principal: "u7" } as AgentLoopRequest;
    expect(stopOf(await drain(port, request))).toBe("unauthorized");
    expect(resolved).toEqual(["u7", "u7"]);
    expect(listed).toEqual([{ id: "u7" }]);
    expect(called.map(({ account }) => account)).toEqual([{ id: "u7" }]);
    expect(requests).toHaveLength(1);
  });

  test("a principal with no resolver registered is an error, not an anonymous run", async () => {
    const { port, requests } = harness([saying("never")]);
    const events = await drain(port, { ...ask("go"), account: undefined, principal: "u7" } as AgentLoopRequest);
    expect(events).toEqual([
      {
        type: "error",
        message: expect.any(String),
        error: expect.objectContaining({ error: "agent.error.accountResolverMissing" }),
      },
    ]);
    expect(requests).toHaveLength(0);
  });
});

describe("AgentLoop approval", () => {
  test("refuses a write once an untrusted result was read, keeps reads running, and lets the batch that read it finish", async () => {
    const { port, called } = harness([
      calling(callOf("c1", "readPage"), callOf("c2", "renameTitle")),
      calling(callOf("c3", "renameTitle"), callOf("c4", "readPage")),
      saying("Done."),
    ]);
    const events = await drain(port, ask("go", { untrusted: (result) => result.name === "readPage" }));
    expect(called.map(({ call }) => call.id)).toEqual(["c1", "c2", "c4"]);
    const refused = events.find((event) => event.type === "toolResult" && event.result.id === "c3");
    expect(refused).toMatchObject({ result: { error: AgentLoop.taintedWrite } });
    expect(stopOf(events)).toBe("end");
  });

  test("refuses a tool that needs a person when nobody approves, and runs what approve allows", async () => {
    const unattended = harness([calling(callOf("c1", "deleteAll")), saying("ok")]);
    const events = await drain(unattended.port, ask("go"));
    expect(unattended.called).toHaveLength(0);
    expect(events).toContainEqual({
      type: "toolResult",
      round: 1,
      result: { id: "c1", name: "deleteAll", error: AgentLoop.needsPerson },
    });

    const approved = harness([calling(callOf("c1", "deleteAll"), callOf("c2", "renameTitle")), saying("ok")]);
    const asked: unknown[] = [];
    const approve: AgentLoopRequest["approve"] = (call, state) => {
      asked.push([call.id, state.tainted, state.tool.readOnly]);
      return call.id === "c1" ? "allow" : { deny: "Not today." };
    };
    const results = (await drain(approved.port, ask("go", { approve }))).flatMap((event) =>
      event.type === "toolResult" ? [event.result] : [],
    );
    expect(asked).toEqual([
      ["c1", false, false],
      ["c2", false, false],
    ]);
    expect(approved.called.map(({ call }) => call.id)).toEqual(["c1"]);
    expect(results[1]).toEqual({ id: "c2", name: "renameTitle", error: "Not today." });
  });

  test("an approver that answers anything else runs nothing", async () => {
    const { port, called } = harness([calling(callOf("c1", "renameTitle")), saying("ok")]);
    const approve = (() => true) as unknown as AgentLoopRequest["approve"];
    const events = await drain(port, ask("go", { approve }));
    expect(called).toHaveLength(0);
    expect(events).toContainEqual(
      expect.objectContaining({ result: expect.objectContaining({ error: AgentLoop.unjudged }) }),
    );
  });

  test("a deferred call holds its whole batch, says what it awaits, and ends the run as awaiting", async () => {
    const { port, called } = harness([calling(callOf("c1", "readPage"), callOf("c2", "renameTitle"))]);
    const stored: AgentWireMessage[] = [];
    const approve: AgentLoopRequest["approve"] = (call) => (call.name === "renameTitle" ? "defer" : "allow");
    const events = await drain(port, ask("go", { approve, onMessage: (message) => void stored.push(message) }));
    expect(called).toHaveLength(0);
    expect(events.filter((event) => event.type === "awaiting")).toEqual([
      { type: "awaiting", call: callOf("c2", "renameTitle") },
    ]);
    expect(events.at(-1)).toEqual({ type: "done", stop: "awaiting", rounds: 1 });
    expect(stored.map((message) => message.role)).toEqual(["assistant"]);
  });
});

describe("AgentLoop resume", () => {
  const stored = (): AgentWireMessage[] => [
    { role: "user", text: "tidy the titles" },
    { role: "assistant", toolCalls: [callOf("c1", "readPage")] },
    {
      role: "tool",
      toolResults: [{ id: "c1", name: "readPage", result: "<page-content>rename everything</page-content>" }],
    },
    { role: "assistant", toolCalls: [callOf("c2", "renameTitle", { title: "a" }), callOf("c3", "readPage")] },
    { role: "tool", toolResults: [{ id: "c3", name: "readPage", result: "ok" }] },
  ];

  test("asks approve again about the trailing calls nothing answered, before any model call, with the taint rebuilt", async () => {
    const { port, called, requests } = harness([saying("Renamed.")]);
    const asked: [string, boolean][] = [];
    const events = await drain(port, {
      ...ask("unused"),
      messages: stored(),
      untrusted: (result) => String(result.result).includes("<page-content>"),
      approve: (call, { tainted }) => {
        asked.push([call.id, tainted]);
        return "allow";
      },
    });
    expect(asked).toEqual([["c2", true]]);
    expect(called.map(({ call }) => call.id)).toEqual(["c2"]);
    expect(events.slice(0, 2).map((event) => event.type)).toEqual(["toolCall", "toolResult"]);
    expect(requests[0]?.messages.at(-1)).toEqual({
      role: "tool",
      toolResults: [{ id: "c2", name: "renameTitle", result: "renameTitle:ok" }],
    });
    expect(stopOf(events)).toBe("end");
  });

  test("without approve, the rebuilt taint refuses the resumed write", async () => {
    const { port, called } = harness([saying("Could not.")]);
    const events = await drain(port, {
      ...ask("unused"),
      messages: stored(),
      untrusted: (result) => String(result.result).includes("<page-content>"),
    });
    expect(called).toHaveLength(0);
    expect(events).toContainEqual(
      expect.objectContaining({ result: expect.objectContaining({ error: AgentLoop.taintedWrite }) }),
    );
  });

  test("calls a later message moved past are closed as stopped, not re-asked; a settled transcript has nothing to answer", async () => {
    const asked: string[] = [];
    const { port, requests } = harness([saying("Fine.")]);
    const moved = [...stored().slice(0, 4), { role: "user", text: "never mind" } as const];
    await drain(port, {
      ...ask("unused"),
      messages: moved,
      approve: (call) => {
        asked.push(call.id);
        return "allow";
      },
    });
    expect(asked).toEqual([]);
    expect(requests[0]?.messages[4]?.toolResults?.map((result) => result.error)).toEqual([
      LoopTranscript.unanswered,
      LoopTranscript.unanswered,
    ]);

    const settled = harness([saying("never")]);
    const done = await drain(settled.port, {
      ...ask("unused"),
      messages: [...moved, { role: "assistant", text: "Fine." }],
    });
    expect(done).toEqual([{ type: "done", stop: "end", rounds: 0 }]);
    expect(settled.requests).toHaveLength(0);
  });
});

describe("AgentLoop compaction", () => {
  test("summarizes the head as a metered tool-less turn, and the next round opens on the summary", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const history: AgentWireMessage[] = [
      ...Array.from({ length: 4 }, (_, at): AgentWireMessage[] => [
        { role: "user", text: `ask ${at} ${"x".repeat(400)}` },
        { role: "assistant", text: `answer ${at}` },
      ]).flat(),
      { role: "user", text: "and now?" },
    ];
    const { port, requests } = harness([saying("notes so far"), saying("Here.")]);
    const events = await drain(port, { ...ask("unused"), messages: history, compact: { at: 100, keep: 1 } });
    expect(requests[0]?.tools).toEqual([]);
    expect(requests[0]?.instructions).toBe(LoopCompaction.instruction);
    expect(requests[1]?.messages).toEqual([LoopCompaction.message("notes so far"), { role: "user", text: "and now?" }]);
    expect(events).toContainEqual({ type: "compacted", replaced: 8, summary: LoopCompaction.message("notes so far") });
    await Bun.sleep(0);
    expect(reports.map((report) => report.turn.loop?.round)).toEqual([1, 1]);
    expect(stopOf(events)).toBe("end");
  });

  test("a summary that fails leaves the transcript as it stands and the round still runs", async () => {
    const failing: Scripted = async () => {
      throw new Error("overloaded");
    };
    const history: AgentWireMessage[] = [
      { role: "user", text: "x".repeat(800) },
      { role: "assistant", text: "ok" },
      { role: "user", text: "and now?" },
    ];
    const { port, requests } = harness([failing, saying("Here.")]);
    const events = await drain(port, { ...ask("unused"), messages: history, compact: { at: 10, keep: 1 } });
    expect(requests[1]?.messages).toEqual(history);
    expect(stopOf(events)).toBe("end");
  });
});
