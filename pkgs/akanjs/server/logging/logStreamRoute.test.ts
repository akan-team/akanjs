import { afterEach, describe, expect, test } from "bun:test";
import { Logger, type LogRecord, logSeverity } from "akanjs/common";
import { isCompressibleContentType } from "../contentEncoding";
import { LogHub } from "./logHub";
import { makeLogRecord } from "./logRecord.fixture";
import { LogStreamRoute } from "./logStreamRoute";

const record = (message: string, overrides: Partial<LogRecord> = {}) =>
  makeLogRecord(message, { origin: "http", endpoint: "mutation:refund", ...overrides });

interface Frame {
  id: number | null;
  data: unknown;
}

const request = (query = "", headers: { [key: string]: string } = {}) =>
  new Request(`http://app/_akan/app/logs${query}`, { headers: { authorization: "Bearer tok", ...headers } });

const readUntil = async (res: Response, predicate: (text: string) => boolean, timeoutMs = 2_000) => {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no body");
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (!predicate(text) && Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), Math.max(1, deadline - Date.now())),
      ),
    ]);
    if (next.done) break;
    text += decoder.decode(next.value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text;
};

const frames = (text: string): Frame[] =>
  text
    .split("\n\n")
    .filter((frame) => frame.includes("data:"))
    .map((frame) => {
      const id = /^id: (\d+)$/m.exec(frame);
      const data = /^data: (.*)$/m.exec(frame);
      return { id: id ? Number(id[1]) : null, data: JSON.parse(data?.[1] ?? "null") };
    });

const dataCount = (text: string) => text.split("data:").length - 1;

describe("LogStreamRoute gate", () => {
  test("does not exist without a token", () => {
    const previous = process.env.AKAN_LOG_STREAM_TOKEN;
    delete process.env.AKAN_LOG_STREAM_TOKEN;
    try {
      expect(LogStreamRoute.fromEnv(() => null)).toBeNull();
      process.env.AKAN_LOG_STREAM_TOKEN = " tok ";
      expect(LogStreamRoute.fromEnv(() => null)).toBeInstanceOf(LogStreamRoute);
    } finally {
      if (previous === undefined) delete process.env.AKAN_LOG_STREAM_TOKEN;
      else process.env.AKAN_LOG_STREAM_TOKEN = previous;
    }
  });

  test("refuses a missing, malformed or wrong bearer, and a stopped hub is 503", () => {
    const route = new LogStreamRoute(() => null, "tok");
    expect(route.handle(new Request("http://app/_akan/app/logs")).status).toBe(401);
    expect(route.handle(request("", { authorization: "tok" })).status).toBe(401);
    expect(route.handle(request("", { authorization: "Bearer toke" })).status).toBe(401);
    expect(route.handle(request("", { authorization: "Bearer tOk" })).status).toBe(401);
    expect(route.handle(request()).status).toBe(503);
  });

  test("reads the bearer as every other gate does: one word after the scheme, in any case and spacing", () => {
    const route = new LogStreamRoute(() => null, "tok");
    expect(route.handle(request("", { authorization: "bearer   tok" })).status).toBe(503);
    for (const authorization of ["Bearer tok extra", "Bearer\ttok", "Bearer tok\tx"])
      expect(route.handle(request("", { authorization })).status).toBe(401);
  });

  test("stays off for a configured token holding whitespace, and never logs the token", () => {
    const previous = process.env.AKAN_LOG_STREAM_TOKEN;
    const messages: string[] = [];
    const removeSink = Logger.addSink((entry) => void messages.push(entry.message));
    process.env.AKAN_LOG_STREAM_TOKEN = "correct horse battery";
    try {
      expect(LogStreamRoute.fromEnv(() => null)).toBeNull();
      expect(messages.some((message) => message.includes("AKAN_LOG_STREAM_TOKEN"))).toBe(true);
      expect(messages.some((message) => message.includes("horse"))).toBe(false);
    } finally {
      removeSink();
      if (previous === undefined) delete process.env.AKAN_LOG_STREAM_TOKEN;
      else process.env.AKAN_LOG_STREAM_TOKEN = previous;
    }
  });
});

describe("LogStreamRoute stream", () => {
  let hub: LogHub;
  afterEach(() => hub?.close());

  test("is an uncompressible event stream carrying the query's matches with the hub seq as id", async () => {
    hub = new LogHub();
    const route = new LogStreamRoute(() => hub, "tok");
    const res = route.handle(request("?level=warn&endpoint=mutation:*"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(isCompressibleContentType(res.headers.get("content-type") ?? "")).toBe(false);
    expect(hub.floor).toBe(logSeverity.warn);
    hub.ingest(record("quiet"));
    hub.ingest(record("loud", { level: "warn", sev: logSeverity.warn }));
    hub.ingest(record("elsewhere", { level: "warn", sev: logSeverity.warn, endpoint: "query:list" }));
    const text = await readUntil(res, (t) => dataCount(t) >= 1);
    expect(text.startsWith("retry: 2000\n\n")).toBe(true);
    expect(frames(text)).toEqual([{ id: 2, data: expect.objectContaining({ seq: 2, message: "loud" }) }]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(hub.floor).toBeNull();
  });

  test("resumes after Last-Event-ID, and names the gap the ring has already evicted", async () => {
    hub = new LogHub({ maxRecords: 3 });
    for (let idx = 1; idx <= 5; idx += 1) hub.ingest(record(`m${idx}`));
    const route = new LogStreamRoute(() => hub, "tok");
    const text = await readUntil(route.handle(request("", { "last-event-id": "1" })), (t) => dataCount(t) >= 4);
    const seen = frames(text);
    expect(seen[0]).toEqual({
      id: null,
      data: { type: "gap", reason: "ring-buffer-evicted", from: 2, to: 2, missed: 1 },
    });
    expect(seen.slice(1).map((frame) => frame.id)).toEqual([3, 4, 5]);
  });

  test("a Last-Event-ID from before a restart is answered with a sequence-reset gap", async () => {
    hub = new LogHub();
    hub.ingest(record("fresh"));
    const route = new LogStreamRoute(() => hub, "tok");
    const text = await readUntil(route.handle(request("", { "last-event-id": "999" })), (t) => dataCount(t) >= 1);
    expect(frames(text)[0]?.data).toEqual({ type: "gap", reason: "sequence-reset", lastEventId: 999, currentSeq: 1 });
  });

  test("delivering records writes no record of its own", async () => {
    hub = new LogHub();
    const removeSink = Logger.addSink((entry) => {
      hub.ingest(entry.record);
    });
    try {
      Logger.setLevel("error");
      const res = new LogStreamRoute(() => hub, "tok").handle(request());
      Logger.info("one", "", "Loop");
      Logger.info("two", "", "Loop");
      Logger.info("three", "", "Loop");
      const text = await readUntil(res, (t) => dataCount(t) >= 3);
      expect(frames(text).map((frame) => (frame.data as { message: string }).message)).toEqual(["one", "two", "three"]);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(hub.size).toBe(3);
    } finally {
      removeSink();
      Logger.setLevel("info");
    }
  });
});
