import { afterEach, describe, expect, test } from "bun:test";
import { ENDPOINT_META } from "akanjs/base";
import { Err } from "akanjs/dictionary";
import {
  AgentMeter,
  type AgentQuotaCheck,
  AgentRelayPolicy,
  AgentService,
  type AgentTurnContext,
  type AgentUsageReport,
  type LlmTurnRequest,
  OpenaiLlm,
} from "akanjs/service";
import { AgentEndpoint } from "./agent.signal";

afterEach(() => {
  AgentRelayPolicy.use(null);
  AgentMeter.use({ quota: null, usage: null });
});

const anonymous = () => AgentMeter.turnOf(null);

const request = (): LlmTurnRequest => ({
  messages: [{ role: "user", text: "hi" }],
  tools: [{ name: "navigate" }, { name: "zone.fill" }, { name: "anything" }],
  context: [{ kind: "screen", scopes: [] }],
  instructions: "You are editing a drawing.",
});

type RunTurn = (turn: LlmTurnRequest, options: { signal?: AbortSignal }) => Promise<{ text: string; stop: "end" }>;

const relay = (
  body: LlmTurnRequest,
  accept: string,
  account: object | null,
  ip: string | null,
  { headers = {}, runTurn, signal }: { headers?: Record<string, string>; runTurn?: RunTurn; signal?: AbortSignal } = {},
) => {
  const turns: LlmTurnRequest[] = [];
  const agentService = {
    runTurn: async (turn: LlmTurnRequest, options: { signal?: AbortSignal }) => {
      turns.push(turn);
      return runTurn ? await runTurn(turn, options) : { text: "ok", stop: "end" as const };
    },
  };
  const req = new Request("http://x/api/runAgentTurn", {
    method: "POST",
    headers: { accept, ...headers },
    ...(signal ? { signal } : {}),
  }) as Bun.BunRequest;
  const run = AgentEndpoint[ENDPOINT_META].runAgentTurn?.execFn?.call(
    { agentService },
    body.messages,
    body.tools,
    body.context,
    body.instructions,
    req,
    account,
    ip,
  ) as Promise<unknown>;
  return { run, turns };
};

describe("AgentRelayPolicy", () => {
  test("hands a request within the default caps on untouched while no policy is set", async () => {
    const sent = request();
    expect(await AgentRelayPolicy.apply(sent, anonymous())).toBe(sent);
  });

  test("refuses a request past a default cap while no policy is set, and an identity policy relays it", async () => {
    const { messages, tools, chars, attachmentChars } = AgentRelayPolicy.defaultLimits;
    const oversized: LlmTurnRequest[] = [
      { ...request(), messages: Array.from({ length: messages + 1 }, () => ({ role: "user" as const, text: "hi" })) },
      { ...request(), tools: Array.from({ length: tools + 1 }, (_, idx) => ({ name: `tool${idx}` })) },
      { ...request(), instructions: "x".repeat(chars + 1) },
      {
        ...request(),
        messages: [
          {
            role: "user",
            text: "look",
            attachments: [{ name: "a.png", mimeType: "image/png", data: "A".repeat(attachmentChars + 1) }],
          },
        ],
      },
    ];
    for (const sent of oversized) {
      const refusal = await AgentRelayPolicy.apply(sent, anonymous()).catch((error: unknown) => error);
      expect(Err.is(refusal, "agent.error.requestRefused")).toBe(true);
      expect((refusal as { statusCode: number }).statusCode).toBe(413);
    }
    AgentRelayPolicy.use((sent) => sent);
    for (const sent of oversized) expect(await AgentRelayPolicy.apply(sent, anonymous())).toBe(sent);
  });

  test("keeps the caps under a policy of the app's own that asks for them, at its own limits", async () => {
    AgentRelayPolicy.use((sent) => AgentRelayPolicy.capped({ ...sent, instructions: "Server scope." }, { tools: 2 }));
    const refusal = await AgentRelayPolicy.apply(request(), anonymous()).catch((error: unknown) => error);
    expect(Err.is(refusal, "agent.error.requestRefused")).toBe(true);
    const within = await AgentRelayPolicy.apply({ ...request(), tools: [] }, anonymous());
    expect(within.instructions).toBe("Server scope.");
  });

  test("still takes the context's old shape, and hands the policy a turn of its own", async () => {
    const seen: AgentTurnContext[] = [];
    AgentRelayPolicy.use((sent, context) => {
      seen.push(context);
      return sent;
    });
    await AgentRelayPolicy.apply(request(), { account: { id: "u1" }, ip: "198.18.0.1" });
    await AgentRelayPolicy.apply(request(), { account: { id: "u1" }, ip: "198.18.0.1" });
    expect(seen).toMatchObject([
      { account: { id: "u1" }, ip: "198.18.0.1" },
      { account: { id: "u1" }, ip: "198.18.0.1" },
    ]);
    expect(seen[0]?.headers).toBeInstanceOf(Headers);
    expect(new Set(seen.map(({ id }) => id)).size).toBe(2);
  });

  test("sends what the policy returns, and null clears it", async () => {
    AgentRelayPolicy.use((sent) => ({ ...sent, instructions: "Server scope." }));
    expect((await AgentRelayPolicy.apply(request(), anonymous())).instructions).toBe("Server scope.");
    AgentRelayPolicy.use(null);
    expect((await AgentRelayPolicy.apply(request(), anonymous())).instructions).toBe("You are editing a drawing.");
  });
});

describe("runAgentTurn under a request policy", () => {
  test("the model gets the policy's request, and the policy sees the caller", async () => {
    const seen: AgentTurnContext[] = [];
    AgentRelayPolicy.use((sent, context) => {
      seen.push(context);
      return {
        ...sent,
        instructions: ["Only help with this app.", sent.instructions].filter(Boolean).join("\n\n"),
        tools: sent.tools.filter(({ name }) => name !== "anything"),
      };
    });
    const { run, turns } = relay(request(), "application/json", { id: "u1" }, "198.18.0.1");
    expect(await run).toMatchObject({ text: "ok" });
    expect(seen).toMatchObject([{ account: { id: "u1" }, ip: "198.18.0.1" }]);
    expect(turns[0]?.instructions).toBe("Only help with this app.\n\nYou are editing a drawing.");
    expect(turns[0]?.tools.map(({ name }) => name)).toEqual(["navigate", "zone.fill"]);
  });

  test("a refusal answers with its own Err before the quota is asked or the model is called", async () => {
    let quotaAsked = false;
    AgentMeter.use({ quota: () => (quotaAsked = true) });
    AgentRelayPolicy.use((sent) => {
      if (!sent.tools.some(({ name }) => name === "navigate")) throw new Err.Forbidden("agent.error.requestRefused");
      return sent;
    });
    for (const accept of ["application/json", "text/event-stream"]) {
      const { run, turns } = relay({ ...request(), tools: [] }, accept, { id: "u1" }, null);
      const refusal = await run.catch((error: unknown) => error);
      expect(Err.is(refusal, "agent.error.requestRefused")).toBe(true);
      expect((refusal as { statusCode: number }).statusCode).toBe(403);
      expect(turns).toEqual([]);
    }
    expect(quotaAsked).toBe(false);
  });

  test("one turn id runs from the policy through the quota to the usage report, with the request's headers", async () => {
    const seen: AgentTurnContext[] = [];
    const checks: AgentQuotaCheck[] = [];
    const reports: AgentUsageReport[] = [];
    AgentRelayPolicy.use((sent, context) => {
      seen.push(context);
      return { ...sent, instructions: "Billed to the org." };
    });
    AgentMeter.use({
      quota: (check) => {
        checks.push(check);
        return true;
      },
      usage: (report) => void reports.push(report),
    });
    for (const accept of ["application/json", "text/event-stream"]) {
      const { run } = relay(request(), accept, { id: "u1" }, null, { headers: { "x-org": "o1" } });
      const answered = await run;
      if (answered instanceof Response) await answered.text();
    }
    await Bun.sleep(0);
    expect(seen.map(({ headers }) => headers.get("x-org"))).toEqual(["o1", "o1"]);
    expect(new Set(seen.map(({ id }) => id)).size).toBe(2);
    expect(checks.map(({ turn }) => turn)).toEqual(seen);
    expect(checks.map(({ request }) => request?.instructions)).toEqual(["Billed to the org.", "Billed to the org."]);
    expect(reports.map(({ turn, outcome }) => ({ turn, outcome }))).toEqual(
      seen.map((turn) => ({ turn, outcome: "ok" })),
    );
  });

  test("a stream whose reader goes away aborts the turn, and the turn is reported aborted", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const started = Promise.withResolvers<void>();
    let signal: AbortSignal | undefined;
    const { run } = relay(request(), "text/event-stream", { id: "u1" }, null, {
      runTurn: (_turn, options) => {
        signal = options.signal;
        started.resolve();
        return new Promise((_resolve, reject) =>
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason)),
        );
      },
    });
    const answered = (await run) as Response;
    await started.promise;
    await answered.body?.cancel();
    await Bun.sleep(0);
    expect(signal?.aborted).toBe(true);
    expect(reports.map(({ outcome }) => outcome)).toEqual(["aborted"]);
  });

  test("a plain client that goes away aborts the turn, and the answer nobody reads is a 499, not a logged 500", async () => {
    const reports: AgentUsageReport[] = [];
    AgentMeter.use({ usage: (report) => void reports.push(report) });
    const client = new AbortController();
    let signal: AbortSignal | undefined;
    const { run } = relay(request(), "application/json", { id: "u1" }, null, {
      signal: client.signal,
      runTurn: (_turn, options) => {
        signal = options.signal;
        client.abort();
        return Promise.reject(options.signal?.reason);
      },
    });
    const answered = await run;
    await Bun.sleep(0);
    expect(signal?.aborted).toBe(true);
    expect(answered instanceof Response ? answered.status : answered).toBe(499);
    expect(reports.map(({ outcome }) => outcome)).toEqual(["aborted"]);
  });

  describe("billing a turn its caller stops, against an OpenAI-compatible provider", () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });
    const service = () =>
      Object.assign(new AgentService(), {
        llm: Object.assign(new OpenaiLlm(), { llmOption: { apiKey: "k", model: "model-a" } }),
      });
    const viaService: RunTurn = (turn, options) => service().runTurn(turn, options) as ReturnType<RunTurn>;

    test("a reader that leaves after three of five deltas is billed at an estimate, not zero", async () => {
      const reports: AgentUsageReport[] = [];
      AgentMeter.use({ usage: (report) => void reports.push(report) });
      const provider: AbortSignal[] = [];
      globalThis.fetch = ((_url: string, init: { signal: AbortSignal }) => {
        provider.push(init.signal);
        const frames = ["One ", "two ", "three "]
          .map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)
          .join("");
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(frames));
                init.signal.addEventListener("abort", () => controller.error(init.signal.reason));
              },
            }),
          ),
        );
      }) as unknown as typeof fetch;
      const { run } = relay(request(), "text/event-stream", { id: "u1" }, null, { runTurn: viaService });
      const reader = ((await run) as Response).body?.getReader();
      let read = "";
      while ((read.match(/"type":"text"/g) ?? []).length < 3) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) break;
        read += new TextDecoder().decode(chunk.value);
      }
      await reader?.cancel();
      await Bun.sleep(5);
      expect(provider[0]?.aborted).toBe(true);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({ outcome: "aborted", model: "model-a", estimated: true });
      expect(reports[0]?.usage.inputTokens).toBeGreaterThan(0);
      expect(reports[0]?.usage.outputTokens).toBeGreaterThanOrEqual(3);
    });

    test("a plain client that leaves gets its 499 at once, and the turn is billed the provider's own counts", async () => {
      const reports: AgentUsageReport[] = [];
      AgentMeter.use({ usage: (report) => void reports.push(report) });
      const answered = Promise.withResolvers<Response>();
      const provider: AbortSignal[] = [];
      globalThis.fetch = ((_url: string, init: { signal: AbortSignal }) => {
        provider.push(init.signal);
        return answered.promise;
      }) as unknown as typeof fetch;
      const client = new AbortController();
      const { run } = relay(request(), "application/json", { id: "u1" }, null, {
        signal: client.signal,
        runTurn: viaService,
      });
      await Bun.sleep(0);
      client.abort();
      expect(((await run) as Response).status).toBe(499);
      expect(provider[0]?.aborted).toBe(false);
      expect(reports).toEqual([]);
      answered.resolve(
        Response.json({
          choices: [{ message: { content: "done" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 50_000, completion_tokens: 900 },
        }),
      );
      await Bun.sleep(5);
      expect(reports.map(({ outcome, usage, estimated }) => ({ outcome, usage, estimated }))).toEqual([
        {
          outcome: "aborted",
          usage: { inputTokens: 50_000, outputTokens: 900, cachedTokens: 0 },
          estimated: undefined,
        },
      ]);
    });
  });
});
