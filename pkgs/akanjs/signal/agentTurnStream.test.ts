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
      throw Object.assign(new Error("agent.error.deepseekRequestFailed"), {
        data: { status: "400", reason: "context length exceeded" },
      });
    });
    expect(await framesOf(response)).toEqual([
      {
        type: "error",
        message: "agent.error.deepseekRequestFailed",
        data: { status: "400", reason: "context length exceeded" },
      },
    ]);
  });
});
