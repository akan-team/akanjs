import { describe, expect, test } from "bun:test";
import { httpRunner } from "./httpRunner";
import type { RunnerEvent, RunnerRequest } from "./types";

const request = (): RunnerRequest => ({
  messages: [{ role: "user", text: "hi" }],
  tools: [],
  context: [{ kind: "screen", scopes: [] }],
  instructions: "sys",
  signal: new AbortController().signal,
});

const collect = async (events: AsyncIterable<RunnerEvent>) => {
  const all: RunnerEvent[] = [];
  for await (const event of events) all.push(event);
  return all;
};

describe("httpRunner", () => {
  test("posts the turn and yields text, toolCall, and done", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: unknown, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      const body = { text: "Hi", toolCalls: [{ id: "c1", name: "bump", args: { n: 1 } }], stop: "toolUse" };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    const runner = httpRunner({ url: "/agent/turn", headers: () => ({ authorization: "Bearer t" }), fetcher });
    const events = await collect(runner.run(request()));
    expect(events).toEqual([
      { type: "text", delta: "Hi" },
      { type: "toolCall", id: "c1", name: "bump", args: { n: 1 } },
      { type: "done", stop: "toolUse" },
    ]);
    expect(seen[0].url).toBe("/agent/turn");
    const posted = JSON.parse(String(seen[0].init.body));
    expect(posted).toEqual({
      messages: [{ role: "user", text: "hi" }],
      tools: [],
      context: [{ kind: "screen", scopes: [] }],
      instructions: "sys",
    });
    expect((seen[0].init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });

  test("a non-ok answer is one error event", async () => {
    const fetcher = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const events = await collect(httpRunner({ url: "/x", fetcher }).run(request()));
    expect(events).toEqual([{ type: "error", message: "Agent turn failed: 503" }]);
  });

  test("stop defaults from the presence of tool calls", async () => {
    const answer = (body: Record<string, unknown>) =>
      (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    const textOnly = await collect(httpRunner({ url: "/x", fetcher: answer({ text: "x" }) }).run(request()));
    expect(textOnly[textOnly.length - 1]).toEqual({ type: "done", stop: "end" });
    const withCalls = await collect(
      httpRunner({ url: "/x", fetcher: answer({ toolCalls: [{ id: "c", name: "t", args: {} }] }) }).run(request()),
    );
    expect(withCalls[withCalls.length - 1]).toEqual({ type: "done", stop: "toolUse" });
  });
});

const sse = (frames: string[], contentType = "text/event-stream") => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return (async () => new Response(stream, { status: 200, headers: { "content-type": contentType } })) as typeof fetch;
};

describe("httpRunner streaming", () => {
  test("negotiates via accept and consumes one RunnerEvent per data line", async () => {
    let accept = "";
    const fetcher = (async (url: unknown, init?: RequestInit) => {
      accept = (init?.headers as Record<string, string> | undefined)?.accept ?? "";
      return sse([
        'data: {"type":"text","delta":"Hel"}\n\n',
        'data: {"type":"text","delta":"lo"}\n\ndata: {"type":"toolCall","id":"c1","name":"bump","args":{}}\n\n',
        'data: {"type":"done","stop":"toolUse"}\n\n',
      ])();
    }) as typeof fetch;
    const events = await collect(httpRunner({ url: "/x", fetcher }).run(request()));
    expect(accept).toContain("text/event-stream");
    expect(events).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
      { type: "toolCall", id: "c1", name: "bump", args: {} },
      { type: "done", stop: "toolUse" },
    ]);
  });

  test("frames split across chunks and keep-alive comments still parse", async () => {
    const fetcher = sse([
      ': ping\n\ndata: {"type":"text","de',
      'lta":"x"}\n\ndata: {"type":"done"',
      ',"stop":"end"}\n\n',
    ]);
    const events = await collect(httpRunner({ url: "/x", fetcher }).run(request()));
    expect(events).toEqual([
      { type: "text", delta: "x" },
      { type: "done", stop: "end" },
    ]);
  });

  test("a stream that ends without done is reported, not swallowed", async () => {
    const fetcher = sse(['data: {"type":"text","delta":"x"}\n\n']);
    const events = await collect(httpRunner({ url: "/x", fetcher }).run(request()));
    expect(events[events.length - 1]).toMatchObject({ type: "error" });
  });

  test("a non-2xx JSON body's message is the error event, verbatim and with what it interpolates", async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ error: "agent.error.deepseekRequestFailed", data: { status: "400" } }), {
        status: 400,
      })) as unknown as typeof fetch;
    const events = await collect(httpRunner({ url: "/x", fetcher }).run(request()));
    expect(events).toEqual([{ type: "error", message: "agent.error.deepseekRequestFailed", data: { status: "400" } }]);
  });

  test("a body with no message falls back to the status, and a nested data is not forwarded", async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ statusCode: 502, data: { nested: { deep: true } } }), {
        status: 502,
      })) as unknown as typeof fetch;
    const events = await collect(httpRunner({ url: "/x", fetcher }).run(request()));
    expect(events).toEqual([{ type: "error", message: "Agent turn failed: 502" }]);
  });
});
