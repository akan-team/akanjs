import { describe, expect, test } from "bun:test";
import { AgentTurnStream } from "./agentTurnStream";

const framesOf = async (response: Response) => {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, "")) as Record<string, unknown>);
};

describe("AgentTurnStream", () => {
  test("wants() reads the accept header", () => {
    const wanting = new Request("http://x/api/runAgentTurn", { headers: { accept: "text/event-stream" } });
    const plain = new Request("http://x/api/runAgentTurn", { headers: { accept: "application/json" } });
    expect(AgentTurnStream.wants(wanting as Bun.BunRequest)).toBe(true);
    expect(AgentTurnStream.wants(plain as Bun.BunRequest)).toBe(false);
  });

  test("the response carries the headers that keep an intermediary from buffering it", () => {
    const response = AgentTurnStream.response(async () => ({ text: "x", stop: "end" }));
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("connection")).toBe("keep-alive");
  });

  test("streams deltas as they arrive, then tool calls, then done", async () => {
    const response = AgentTurnStream.response(async (onDelta) => {
      onDelta("Nav");
      onDelta("igating.");
      return {
        text: "Navigating.",
        toolCalls: [{ id: "c1", name: "navigate", args: { path: "/docs" } }],
        stop: "toolUse",
      };
    });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await framesOf(response)).toEqual([
      { type: "text", delta: "Nav" },
      { type: "text", delta: "igating." },
      { type: "toolCall", id: "c1", name: "navigate", args: { path: "/docs" } },
      { type: "done", stop: "toolUse" },
    ]);
  });

  test("an adapter that ignores onDelta still delivers its text as one late delta", async () => {
    const response = AgentTurnStream.response(async () => ({ text: "whole answer", stop: "end" }));
    expect(await framesOf(response)).toEqual([
      { type: "text", delta: "whole answer" },
      { type: "done", stop: "end" },
    ]);
  });

  test("a failure after the stream opened travels as the wire's error event", async () => {
    const response = AgentTurnStream.response(async (onDelta) => {
      onDelta("par");
      throw new Error("agent.error.llmUnavailable");
    });
    expect(await framesOf(response)).toEqual([
      { type: "text", delta: "par" },
      { type: "error", message: "agent.error.llmUnavailable" },
    ]);
  });

  test("a domain Err sends the values its text interpolates alongside its key", async () => {
    const response = AgentTurnStream.response(async () => {
      throw Object.assign(new Error("agent.error.llmRequestFailed"), {
        data: { status: "400", reason: "context length exceeded" },
      });
    });
    expect(await framesOf(response)).toEqual([
      {
        type: "error",
        message: "agent.error.llmRequestFailed",
        data: { status: "400", reason: "context length exceeded" },
      },
    ]);
  });

  test("done carries the provider's count and the model's limits in the wire's own shape", async () => {
    const response = AgentTurnStream.response(async () => ({
      text: "ok",
      stop: "end",
      usage: { inputTokens: 18_230, outputTokens: 41, cachedTokens: 9_000 },
      limits: { window: 128_000, output: 8_192 },
    }));
    expect((await framesOf(response)).at(-1)).toEqual({
      type: "done",
      stop: "end",
      usage: { input: 18_230, output: 41 },
      limits: { window: 128_000, output: 8_192 },
    });
  });

  test("a prompt past the window is flagged, so a session can compact and ask again", async () => {
    const response = AgentTurnStream.response(async () => {
      throw Object.assign(new Error("agent.error.contextOverflow"), {
        data: { provider: "api.deepseek.com", limit: 65_536 },
      });
    });
    expect(await framesOf(response)).toEqual([
      {
        type: "error",
        message: "agent.error.contextOverflow",
        data: { provider: "api.deepseek.com", limit: 65_536 },
        overflow: { limit: 65_536 },
      },
    ]);
  });
});
