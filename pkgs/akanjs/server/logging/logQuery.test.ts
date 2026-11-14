import { describe, expect, test } from "bun:test";
import { type LogRecord, logSeverity } from "akanjs/common";
import { LogQueryMatcher } from "./logQuery";
import { makeLogRecord } from "./logRecord.fixture";

const record = (overrides: Partial<LogRecord> = {}) =>
  makeLogRecord("payment refund started for order 1234", {
    name: "PaymentService",
    origin: "http",
    traceId: "t-1",
    endpoint: "mutation:refundPayment",
    ...overrides,
  });

const matches = (query: ConstructorParameters<typeof LogQueryMatcher>[0], overrides: Partial<LogRecord> = {}) =>
  new LogQueryMatcher(query).matches(record(overrides));

describe("LogQueryMatcher trace", () => {
  const stored = "0af7651916cd43dd8448eb211c80319c";

  test("finds a record by the id it linked as well as by its own, so a job is found by the call that enqueued it", () => {
    const job = { traceId: "f".repeat(32), link: stored, endpoint: "internal:sendMail", origin: "internal" };

    expect(matches({ traceId: stored }, job)).toBe(true);
    expect(matches({ traceId: "f".repeat(32) }, job)).toBe(true);
    expect(matches({ traceId: stored }, { traceId: "f".repeat(32) })).toBe(false);
    expect(matches({ traceId: "e".repeat(32) }, job)).toBe(false);
  });

  test("reads the searched id as an inbound one is read: a UUID in any case finds its 32-digit form", () => {
    for (const typed of ["0AF76519-16CD-43DD-8448-EB211C80319C", "0af76519-16cd-43dd-8448-eb211c80319c", stored]) {
      expect(matches({ traceId: typed }, { traceId: stored })).toBe(true);
      expect(matches({ traceId: typed }, { traceId: "f".repeat(32), link: stored })).toBe(true);
      expect(matches(LogQueryMatcher.parse({ trace: typed }), { traceId: stored })).toBe(true);
    }
    expect(matches({ traceId: "mdx3k2a1-4f9z0q" }, { traceId: "mdx3k2a1-4f9z0q" })).toBe(true);
    expect(matches({ traceId: "0AF76519" }, { traceId: stored })).toBe(false);
  });
});

describe("LogQueryMatcher", () => {
  test("an empty query matches everything, raw lines included", () => {
    expect(matches({})).toBe(true);
    expect(matches({}, { level: null, sev: 0 })).toBe(true);
  });

  test("minSev keeps the level and above, and excludes raw lines", () => {
    expect(matches({ minSev: logSeverity.warn })).toBe(false);
    expect(matches({ minSev: logSeverity.info })).toBe(true);
    expect(matches({ minSev: logSeverity.info }, { level: "error", sev: logSeverity.error })).toBe(true);
    expect(matches({ minSev: 0 }, { level: null, sev: 0 })).toBe(false);
  });

  test("text is a substring of the message only", () => {
    expect(matches({ text: "refund" })).toBe(true);
    expect(matches({ text: "PaymentService" })).toBe(false);
  });

  test("endpoint and name accept * globs, and a record with no endpoint never matches one", () => {
    expect(matches({ endpoint: ["mutation:*"] })).toBe(true);
    expect(matches({ endpoint: ["*:refundPayment"] })).toBe(true);
    expect(matches({ endpoint: ["query:*"] })).toBe(false);
    expect(matches({ endpoint: ["mutation:*"] }, { endpoint: null })).toBe(false);
    expect(matches({ name: ["Payment*"] })).toBe(true);
    expect(matches({ name: ["User*", "Payment*"] })).toBe(true);
  });

  test("glob text outside * is literal", () => {
    expect(matches({ endpoint: ["mutation:refund.ayment"] })).toBe(false);
  });

  test("fields AND together and lists OR", () => {
    expect(matches({ minSev: logSeverity.info, text: "refund", endpoint: ["mutation:*"] })).toBe(true);
    expect(matches({ minSev: logSeverity.warn, text: "refund", endpoint: ["mutation:*"] })).toBe(false);
    expect(matches({ child: [1, 2] })).toBe(false);
    expect(matches({ child: [0, 2] })).toBe(true);
    expect(matches({ role: ["gateway"] })).toBe(false);
    expect(matches({ role: ["gateway", "all"] })).toBe(true);
    expect(matches({ origin: ["mcp"] })).toBe(false);
    expect(matches({ traceId: "t-2" })).toBe(false);
    expect(matches({ traceId: "t-1" })).toBe(true);
    expect(matches({ stream: ["stderr"] })).toBe(false);
    expect(matches({ since: 2_000 })).toBe(false);
    expect(matches({ since: 1_000 })).toBe(true);
  });
});

describe("LogQueryMatcher.parse", () => {
  test("reads a query string with level sugar, lists and a relative since", () => {
    const now = 100_000;
    const query = LogQueryMatcher.parse(
      new URLSearchParams(
        "level=warn&grep=payment&endpoint=mutation:*,query:userList&child=0&child=1&since=5s&limit=20",
      ),
      now,
    );
    expect(query).toEqual({
      minSev: logSeverity.warn,
      text: "payment",
      endpoint: ["mutation:*", "query:userList"],
      child: [0, 1],
      since: now - 5_000,
      limit: 20,
    });
  });

  test("reads a JSON object with the same keys", () => {
    expect(LogQueryMatcher.parse({ minSev: 13, name: ["A", "B"], traceId: "t" })).toEqual({
      minSev: 13,
      name: ["A", "B"],
      traceId: "t",
    });
  });

  test("the legacy log level name means info and garbage is dropped", () => {
    expect(LogQueryMatcher.parse({ level: "log" })).toEqual({ minSev: logSeverity.info });
    expect(LogQueryMatcher.parse({ level: "loud", since: "yesterday", limit: "-1" })).toEqual({});
  });
});

describe("LogQueryMatcher promoted records", () => {
  test("a flight or debug record passes minSev, since it was asked for below the level", () => {
    const matcher = new LogQueryMatcher({ minSev: logSeverity.warn });
    const base = makeLogRecord("m", { at: 1, level: "trace", sev: logSeverity.trace });
    expect(matcher.matches(base)).toBe(false);
    expect(matcher.matches({ ...base, attrs: { flight: true } })).toBe(true);
    expect(matcher.matches({ ...base, attrs: { debug: true } })).toBe(true);
    expect(
      new LogQueryMatcher({ minSev: logSeverity.warn, text: "x" }).matches({ ...base, attrs: { flight: true } }),
    ).toBe(false);
  });
});
