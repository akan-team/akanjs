import { describe, expect, spyOn, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";
import { Err } from "akanjs/dictionary";
import { AgentTurnStream } from "./agentTurnStream";
import { SignalFailure } from "./SignalFailure";

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

  test("a reader that goes away aborts the turn's signal", async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const response = AgentTurnStream.response(
      (_onDelta, signal) =>
        new Promise((_resolve, reject) => {
          started.resolve(signal);
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    );
    const signal = await started.promise;
    expect(signal.aborted).toBe(false);
    await response.body?.cancel();
    expect(signal.aborted).toBe(true);
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
      throw new Err("agent.error.llmUnavailable");
    });
    expect(await framesOf(response)).toEqual([
      { type: "text", delta: "par" },
      { type: "error", message: "agent.error.llmUnavailable", code: "agent.error.llmUnavailable" },
    ]);
  });

  test("a domain Err sends the values its text interpolates alongside its key", async () => {
    const response = AgentTurnStream.response(async () => {
      throw new Err("agent.error.llmRequestFailed", { status: "400", reason: "context length exceeded" });
    });
    expect(await framesOf(response)).toEqual([
      {
        type: "error",
        message: "agent.error.llmRequestFailed",
        code: "agent.error.llmRequestFailed",
        data: { status: "400", reason: "context length exceeded" },
      },
    ]);
  });

  test("a framework error is named by its own code, and a guard's refusal by its status alone", () => {
    expect(AgentTurnStream.failure(new AkanError("liveRoomTaken", "room r1 is held")).code).toBe("liveRoomTaken");
    expect(AgentTurnStream.failure(new Err.Forbidden("agent.error.requestRefused")).code).toBe("forbidden");
    expect(AgentTurnStream.failure(new AkanError("grantDenied", "no grant", { statusCode: 403 })).code).toBe(
      "grantDenied",
    );
    expect(AgentTurnStream.failure(new Err.Conflict("base.error.idempotencyInFlight")).code).toBe(
      "base.error.idempotencyInFlight",
    );
  });

  test("an error with no status is named as a crash, and one whose toJSON() throws by its status", async () => {
    const statusless = Object.assign(new Error("no status"), {
      statusCode: 0,
      toJSON: () => ({ code: "vendorQuota" }),
    });
    expect(AgentTurnStream.failure(statusless).code).toBe("internalError");
    const unreadable = Object.assign(new Error("unreadable"), {
      statusCode: 409,
      toJSON: () => {
        throw new Error("toJSON failed");
      },
    });
    const response = AgentTurnStream.response(async () => {
      throw unreadable;
    });
    expect(await framesOf(response)).toEqual([{ type: "error", message: "unreadable", code: "conflict" }]);
  });

  test("a duck-typed body's code names a 4xx but never a 5xx", () => {
    const failing = (statusCode: number) =>
      Object.assign(new Error("vendor said: secret detail"), {
        statusCode,
        toJSON: () => ({ error: "vendor said: secret detail", code: "vendorQuota", statusCode }),
      });
    expect(AgentTurnStream.failure(failing(429)).code).toBe("vendorQuota");
    expect(AgentTurnStream.failure(failing(502)).code).toBe("badGateway");
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
      throw new Err("agent.error.contextOverflow", { provider: "api.deepseek.com", limit: 65_536 });
    });
    expect(await framesOf(response)).toEqual([
      {
        type: "error",
        message: "agent.error.contextOverflow",
        code: "agent.error.contextOverflow",
        data: { provider: "api.deepseek.com", limit: 65_536 },
        overflow: { limit: 65_536 },
      },
    ]);
  });

  test("an adapter's own error reaches the chat as a generic failure outside development, and the log in full", async () => {
    const keys = ["NODE_ENV", "AKAN_COMMAND_TYPE", "AKAN_ERROR_DETAIL"] as const;
    const saved = keys.map((key) => [key, process.env[key]] as const);
    const logged = spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = "production";
    SignalFailure.reset();
    try {
      const response = AgentTurnStream.response(async () => {
        throw new Error("upstream 401: invalid key for https://llm.internal/v1");
      });
      expect(await framesOf(response)).toEqual([
        { type: "error", message: "Internal Server Error", code: "internalError" },
      ]);
      expect(logged.mock.calls.map(([line]) => String(line))).toEqual([
        "agent turn failed after its stream opened: Error: upstream 401: invalid key for https://llm.internal/v1",
      ]);
    } finally {
      for (const [key, value] of saved)
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      SignalFailure.reset();
      logged.mockRestore();
    }
  });
});
