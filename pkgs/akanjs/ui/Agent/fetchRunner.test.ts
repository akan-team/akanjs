import { describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { registerClientRuntime, Translator } from "akanjs/client";
import type { RunnerEvent, RunnerRequest } from "use-agentic";
import { setTestEnv } from "../testHelpers.fixture";
import { fetchRunner } from "./fetchRunner";

setTestEnv("runnertest");

const handlerHolder: { runAgentTurn?: () => void; instance?: { jwt?: string | null } } = {};
registerClientRuntime({ fetch: handlerHolder });

const request = (over: Partial<RunnerRequest> = {}): RunnerRequest => ({
  messages: [{ role: "user", text: "hello" }],
  tools: [],
  context: [{ kind: "route", path: "/" }],
  signal: new AbortController().signal,
  ...over,
});

const collect = async (req: RunnerRequest, fetcher?: typeof fetch) => {
  const out: RunnerEvent[] = [];
  for await (const event of fetchRunner(fetcher ? { fetcher } : {}).run(req)) out.push(event);
  return out;
};

describe("fetchRunner", () => {
  test("reports a missing endpoint as an error event, not a crash", async () => {
    delete handlerHolder.runAgentTurn;
    const events = await collect(request());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error" });
    expect((events[0] as { message: string }).message).toContain("runAgentTurn");
  });

  test("posts the wire JSON to the unprefixed route with the client's JWT", async () => {
    handlerHolder.runAgentTurn = () => undefined;
    handlerHolder.instance = { jwt: "tkn" };
    const seen: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: unknown, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ text: "Hi", stop: "end" }), { status: 200 });
    }) as typeof fetch;
    const events = await collect(request({ instructions: "Do it" }), fetcher);
    expect(events).toEqual([
      { type: "text", delta: "Hi" },
      { type: "done", stop: "end" },
    ]);
    expect(seen[0].url.endsWith("/runAgentTurn")).toBe(true);
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tkn");
    expect(headers.accept).toContain("text/event-stream");
    expect(JSON.parse(String(seen[0].init.body))).toEqual({
      messages: [{ role: "user", text: "hello" }],
      tools: [],
      context: [{ kind: "route", path: "/" }],
      instructions: "Do it",
    });
    delete handlerHolder.instance;
  });

  test("a streaming answer arrives as incremental events", async () => {
    handlerHolder.runAgentTurn = () => undefined;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"text","delta":"Str"}\n\n'));
        controller.enqueue(
          encoder.encode('data: {"type":"text","delta":"eam"}\n\ndata: {"type":"done","stop":"end"}\n\n'),
        );
        controller.close();
      },
    });
    const fetcher = (async () =>
      new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })) as unknown as typeof fetch;
    const events = await collect(request(), fetcher);
    expect(events).toEqual([
      { type: "text", delta: "Str" },
      { type: "text", delta: "eam" },
      { type: "done", stop: "end" },
    ]);
  });

  test("a server error's message lands in the transcript's error event", async () => {
    handlerHolder.runAgentTurn = () => undefined;
    const fetcher = (async () =>
      new Response(JSON.stringify({ message: "the relay is down" }), {
        status: 500,
      })) as unknown as typeof fetch;
    const events = await collect(request(), fetcher);
    expect(events).toEqual([{ type: "error", message: "the relay is down", code: "internalError" }]);
  });

  test("a domain Err arrives as its key and is resolved against the dictionary, values interpolated", async () => {
    Translator.seed("ko", {
      agent: { error: { llmRequestFailed: { t: "{provider}가 거절했습니다 (status {status})." } } },
    });
    Translator.setActiveLocale("ko");
    handlerHolder.runAgentTurn = () => undefined;
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          error: "agent.error.llmRequestFailed",
          data: { provider: "api.deepseek.com", status: "400" },
        }),
        { status: 400 },
      )) as unknown as typeof fetch;
    expect(await collect(request(), fetcher)).toEqual([
      { type: "error", message: "api.deepseek.com가 거절했습니다 (status 400).", code: "agent.error.llmRequestFailed" },
    ]);
  });

  test("a refused key is translated but named by its status, as the stream names it", async () => {
    Translator.seed("en", { agent: { error: { requestRefused: { t: "Refused." } } } });
    Translator.setActiveLocale("en");
    handlerHolder.runAgentTurn = () => undefined;
    const fetcher = (async () =>
      new Response(JSON.stringify({ error: "agent.error.requestRefused", statusCode: 403 }), {
        status: 403,
      })) as unknown as typeof fetch;
    expect(await collect(request(), fetcher)).toEqual([{ type: "error", message: "Refused.", code: "forbidden" }]);
  });

  test("a translated key past the code's bound stays off the event", async () => {
    const module = "m".repeat(70);
    Translator.seed("en", { [module]: { error: { x: { t: "Too long a key." } } } });
    Translator.setActiveLocale("en");
    handlerHolder.runAgentTurn = () => undefined;
    const fetcher = (async () =>
      new Response(`data: ${JSON.stringify({ type: "error", message: `${module}.error.x` })}\n\n`, {
        headers: { "content-type": "text/event-stream" },
      })) as unknown as typeof fetch;
    expect(await collect(request(), fetcher)).toEqual([{ type: "error", message: "Too long a key." }]);
  });

  test("use-agentic's copied status table matches the framework's", async () => {
    handlerHolder.runAgentTurn = () => undefined;
    for (const status of [400, 401, 403, 404, 409, 413, 415, 418, 429, 500, 502, 503, 504]) {
      const fetcher = (async () => new Response("", { status })) as unknown as typeof fetch;
      expect(await collect(request(), fetcher)).toEqual([
        { type: "error", message: `Agent turn failed: ${status}`, code: AkanError.codeOfStatus(status) },
      ]);
    }
  });

  test("a translated overflow keeps the flag the session compacts on, and its key as the code", async () => {
    Translator.seed("en", {
      agent: { error: { contextOverflow: { t: "No longer fits at {provider}." } } },
    });
    Translator.setActiveLocale("en");
    handlerHolder.runAgentTurn = () => undefined;
    const fetcher = (async () =>
      new Response(
        `data: ${JSON.stringify({
          type: "error",
          message: "agent.error.contextOverflow",
          data: { provider: "api.deepseek.com", limit: 65_536 },
          overflow: { limit: 65_536 },
        })}\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      )) as unknown as typeof fetch;
    expect(await collect(request(), fetcher)).toEqual([
      {
        type: "error",
        message: "No longer fits at api.deepseek.com.",
        code: "agent.error.contextOverflow",
        overflow: { limit: 65_536 },
      },
    ]);
  });

  test("a key with no entry is left as it is rather than becoming a worse sentence", async () => {
    Translator.setActiveLocale("ko");
    handlerHolder.runAgentTurn = () => undefined;
    const fetcher = (async () =>
      new Response(JSON.stringify({ error: "agent.error.notInAnyDictionary" }), {
        status: 400,
      })) as unknown as typeof fetch;
    expect(await collect(request(), fetcher)).toEqual([
      { type: "error", message: "agent.error.notInAnyDictionary", code: "agent.error.notInAnyDictionary" },
    ]);
  });
});
