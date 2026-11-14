import { describe, expect, test } from "bun:test";
import { Logger, type LogRecord, logSeverity } from "akanjs/common";
import { LogHub, type LogHubEntry } from "./logHub";
import { makeLogRecord } from "./logRecord.fixture";

const record = (message: string, overrides: Partial<LogRecord> = {}) =>
  makeLogRecord(message, { origin: "http", endpoint: "query:userList", ...overrides });

describe("LogHub ring", () => {
  test("assigns a monotonic seq and keeps the newest N records", () => {
    const hub = new LogHub({ maxRecords: 3 });
    for (let idx = 1; idx <= 5; idx += 1) hub.ingest(record(`m${idx}`));
    const { entries, coverage } = hub.history({});
    expect(entries.map((entry) => entry.seq)).toEqual([3, 4, 5]);
    expect(entries.map((entry) => entry.record.message)).toEqual(["m3", "m4", "m5"]);
    expect(coverage).toMatchObject({ count: 3, oldestSeq: 3, newestSeq: 5 });
    hub.close();
  });

  test("evicts on bytes too, so one huge line cannot hold the ring", () => {
    const hub = new LogHub({ maxRecords: 100, maxBytes: 1_000 });
    hub.ingest(record("a".repeat(500)));
    hub.ingest(record("b".repeat(500)));
    hub.ingest(record("c"));
    expect(hub.history({}).entries.map((entry) => entry.record.message[0])).toEqual(["b", "c"]);
    hub.close();
  });

  test("counts attrs toward the byte cap, so a record's stack weighs what it holds", () => {
    const hub = new LogHub({ maxRecords: 100, maxBytes: 1_000 });
    hub.ingest(record("a", { attrs: { status: 500, stack: "s".repeat(500) } }));
    hub.ingest(record("b", { attrs: { status: 500, stack: "s".repeat(500) } }));
    hub.ingest(record("c"));
    expect(hub.history({}).entries.map((entry) => entry.record.message)).toEqual(["b", "c"]);
    hub.close();
  });

  test("history filters, honours limit from the newest end, and since reports gaps", () => {
    const hub = new LogHub({ maxRecords: 3 });
    hub.ingest(record("keep 1"));
    hub.ingest(record("drop", { level: "debug", sev: logSeverity.debug }));
    hub.ingest(record("keep 2"));
    hub.ingest(record("keep 3"));
    const { entries } = hub.history({ minSev: logSeverity.info, limit: 2 });
    expect(entries.map((entry) => entry.record.message)).toEqual(["keep 2", "keep 3"]);
    expect(hub.since(0)).toMatchObject({ gap: { from: 1, to: 1, missed: 1 } });
    expect(hub.since(3).entries.map((entry) => entry.seq)).toEqual([4]);
    expect(hub.since(3).gap).toBeNull();
    hub.close();
  });
});

describe("LogHub subscribers", () => {
  test("fan out only what each query matches, and the floor follows the lowest minSev", () => {
    const hub = new LogHub();
    const floors: (number | null)[] = [];
    hub.onFloorChange((minSev) => floors.push(minSev));
    const warnSeen: string[] = [];
    const allSeen: string[] = [];
    const warn = hub.subscribe({ minSev: logSeverity.warn }, (entry) => warnSeen.push(entry.record.message));
    expect(hub.floor).toBe(logSeverity.warn);
    const all = hub.subscribe({ text: "x" }, (entry) => allSeen.push(entry.record.message));
    expect(hub.floor).toBe(0);
    hub.ingest(record("x info"));
    hub.ingest(record("x warn", { level: "warn", sev: logSeverity.warn }));
    hub.ingest(record("y warn", { level: "warn", sev: logSeverity.warn }));
    expect(warnSeen).toEqual(["x warn", "y warn"]);
    expect(allSeen).toEqual(["x info", "x warn"]);
    all.unsubscribe();
    expect(hub.floor).toBe(logSeverity.warn);
    warn.unsubscribe();
    expect(hub.floor).toBeNull();
    expect(floors).toEqual([logSeverity.warn, 0, logSeverity.warn, null]);
    hub.close();
  });

  test("a throwing subscriber does not stop the others", () => {
    const hub = new LogHub();
    const seen: LogHubEntry[] = [];
    hub.subscribe({}, () => {
      throw new Error("bad sink");
    });
    hub.subscribe({}, (entry) => seen.push(entry));
    hub.ingest(record("m"));
    expect(seen.length).toBe(1);
    hub.close();
  });
});

describe("LogHub suppression", () => {
  test("collapses identical lines past the per-second budget into one counted line", () => {
    let now = 10_000;
    const hub = new LogHub({ suppressPerSecond: 2, now: () => now });
    const seen: string[] = [];
    hub.subscribe({}, (entry) => seen.push(entry.record.message));
    for (let idx = 0; idx < 5; idx += 1) hub.ingest(record("loop warn"));
    hub.ingest(record("other"));
    expect(seen).toEqual(["loop warn", "loop warn", "other"]);
    now += 1_001;
    hub.ingest(record("loop warn"));
    expect(seen.slice(3)).toEqual(["loop warn (suppressed 3 identical lines within 1s)", "loop warn"]);
    hub.close();
  });

  test("a request line is never folded, while the ring still folds other repeats", () => {
    const hub = new LogHub({ suppressPerSecond: 2, now: () => 10_000 });
    for (let idx = 0; idx < 5; idx += 1)
      hub.ingest(record("ok query:userList", { name: "Signal", attrs: { ms: idx, status: 200 } }));
    for (let idx = 0; idx < 5; idx += 1) hub.ingest(record("loop warn"));
    const messages = hub.history({}).entries.map((entry) => entry.record.message);
    expect(messages.filter((message) => message === "ok query:userList").length).toBe(5);
    expect(messages.filter((message) => message === "loop warn").length).toBe(2);
    hub.close();
  });

  test("keeps the ring in seq order when a new window writes the fold line, so a resume repeats nothing", () => {
    let now = 10_000;
    const hub = new LogHub({ suppressPerSecond: 1, now: () => now });
    hub.ingest(record("first"));
    for (let idx = 0; idx < 3; idx += 1) hub.ingest(record("loop warn"));
    now += 1_001;
    hub.ingest(record("loop warn"));
    const seqs = hub.since(0).entries.map((entry) => entry.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(hub.coverage().newestSeq).toBe(hub.seq);
    const delivered = hub.since(0).entries;
    const resumeFrom = delivered[delivered.length - 2]?.seq ?? 0;
    expect(hub.since(resumeFrom).entries.map((entry) => entry.record.message)).toEqual(["loop warn"]);
    expect(hub.since(resumeFrom).gap).toBeNull();
    hub.close();
  });

  test("raw lines are never suppressed", () => {
    const hub = new LogHub({ suppressPerSecond: 1 });
    for (let idx = 0; idx < 3; idx += 1) hub.ingest(record("banner", { level: null, sev: 0 }));
    expect(hub.size).toBe(3);
    hub.close();
  });
});

describe("LogHub.attach", () => {
  test("is one hub per process, fed by the Logger until closed, and a fresh one after", () => {
    const hub = LogHub.attach();
    try {
      expect(LogHub.attach()).toBe(hub);
      Logger.setLevel("error");
      Logger.info("boot line", "", "AttachTest");
      expect(hub.history({ text: "boot line" }).entries.length).toBe(1);
    } finally {
      hub.close();
      Logger.setLevel("info");
    }
    expect(hub.closed).toBe(true);
    Logger.info("after close", "", "AttachTest");
    const next = LogHub.attach();
    try {
      expect(next).not.toBe(hub);
      expect(next.history({ text: "after close" }).entries).toEqual([]);
    } finally {
      next.close();
    }
  });

  test("in ndjson mode it silences the console and writes the JSON stream itself", () => {
    const writes: string[] = [];
    const original = process.stdout.write;
    process.stdout.write = ((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    Logger.format = "ndjson";
    Logger.setLevel("info");
    const hub = LogHub.attach();
    try {
      expect(Logger.consoleOutput).toBe(false);
      Logger.info("as json", "", "AttachTest");
      Logger.debug("below", "", "AttachTest");
      expect(writes.length).toBe(1);
      expect(JSON.parse(writes[0] ?? "")).toMatchObject({ seq: 1, level: "info", message: "as json" });
    } finally {
      hub.close();
      Logger.format = "text";
      Logger.consoleOutput = true;
      process.stdout.write = original;
    }
  });
});
