import { afterEach, describe, expect, test } from "bun:test";
import { ENDPOINT_META } from "akanjs/base";
import { Err } from "akanjs/dictionary";
import type { LlmTurnRequest } from "akanjs/service";
import { AgentEndpoint } from "./agent.signal";
import { AgentMeter } from "./agentMeter";
import { AgentRelayPolicy, type AgentRequestContext } from "./agentRelayPolicy";

afterEach(() => {
  AgentRelayPolicy.use(null);
  AgentMeter.use({ quota: null });
});

const request = (): LlmTurnRequest => ({
  messages: [{ role: "user", text: "hi" }],
  tools: [{ name: "navigate" }, { name: "zone.fill" }, { name: "anything" }],
  context: [{ kind: "screen", scopes: [] }],
  instructions: "You are editing a drawing.",
});

const relay = (body: LlmTurnRequest, accept: string, account: object | null, ip: string | null) => {
  const turns: LlmTurnRequest[] = [];
  const agentService = {
    runTurn: async (turn: LlmTurnRequest) => {
      turns.push(turn);
      return { text: "ok", stop: "end" as const };
    },
  };
  const req = new Request("http://x/api/runAgentTurn", { method: "POST", headers: { accept } }) as Bun.BunRequest;
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
  test("hands the request on untouched while no policy is set", async () => {
    const sent = request();
    expect(await AgentRelayPolicy.apply(sent, { account: null, ip: null })).toBe(sent);
  });

  test("sends what the policy returns, and null clears it", async () => {
    AgentRelayPolicy.use((sent) => ({ ...sent, instructions: "Server scope." }));
    expect((await AgentRelayPolicy.apply(request(), { account: null, ip: null })).instructions).toBe("Server scope.");
    AgentRelayPolicy.use(null);
    expect((await AgentRelayPolicy.apply(request(), { account: null, ip: null })).instructions).toBe(
      "You are editing a drawing.",
    );
  });
});

describe("runAgentTurn under a request policy", () => {
  test("the model gets the policy's request, and the policy sees the caller", async () => {
    const seen: AgentRequestContext[] = [];
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
    expect(seen).toEqual([{ account: { id: "u1" }, ip: "198.18.0.1" }]);
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
});
