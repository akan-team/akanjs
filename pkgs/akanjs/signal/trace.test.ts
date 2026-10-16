import { afterEach, describe, expect, test } from "bun:test";
import { Logger, type LoggerSinkEntry, logSeverity } from "akanjs/common";
import {
  getCurrentTrace,
  runTraced,
  SignalTrace,
  setCanonicalLineMode,
  setFlightRecorderEnabled,
  setFlightThresholdMs,
  setLogContextEnabled,
  setTraceEnabled,
  traceAggregator,
  traceSpan,
} from "./trace";

afterEach(() => {
  setTraceEnabled(false);
  setLogContextEnabled(true);
  setCanonicalLineMode("off");
  setFlightRecorderEnabled(false);
  setFlightThresholdMs(1_000);
  traceAggregator.reset();
});

const captureStdout = () => {
  const writes: string[] = [];
  const original = process.stdout.write;
  process.stdout.write = ((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  return {
    writes,
    restore: () => {
      process.stdout.write = original;
    },
  };
};

const collect = () => {
  const entries: LoggerSinkEntry[] = [];
  const removeSink = Logger.addSink((entry) => void entries.push(entry));
  Logger.setLevel("error");
  return {
    entries,
    canonical: () => entries.filter((entry) => entry.record.name === "Signal"),
    restore: () => {
      removeSink();
      Logger.setLevel("info");
    },
  };
};

describe("SignalTrace.create", () => {
  test("is a context trace by default and a full trace under AKAN_TRACE", () => {
    setTraceEnabled(false);
    setLogContextEnabled(true);
    expect(SignalTrace.create("userList", "query", "http")?.mode).toBe("context");
    setTraceEnabled(true);
    expect(SignalTrace.create("userList", "query", "http")?.mode).toBe("full");
  });

  test("is null once both switches are off", () => {
    setTraceEnabled(false);
    setLogContextEnabled(false);
    expect(SignalTrace.create("userList", "query", "http")).toBeNull();
  });

  test("keeps one traceId for its life, stamped with the time it started rather than first read", () => {
    const before = Date.now();
    const trace = new SignalTrace("lazyId", "query", { mode: "context" });
    const after = Date.now();
    const id = trace.traceId;

    expect(trace.traceId).toBe(id);
    expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]{1,6}$/);
    const startedAt = Number.parseInt(id.split("-")[0] ?? "", 36);
    expect(startedAt).toBeGreaterThanOrEqual(before);
    expect(startedAt).toBeLessThanOrEqual(after);
    expect(new SignalTrace("lazyId", "query").traceId).not.toBe(id);
  });

  test("names the endpoint as type:key", () => {
    expect(SignalTrace.create("signScContract", "mutation", "http")?.endpoint).toBe("mutation:signScContract");
  });
});

describe("context mode", () => {
  test("counts nothing and never reaches the aggregator", async () => {
    const trace = new SignalTrace("userList", "query", { mode: "context" });
    await runTraced(trace, async () => {
      await traceSpan("guard", async () => undefined);
      getCurrentTrace()?.countDbQuery(3);
      getCurrentTrace()?.countCache(true);
    });
    expect(trace.spans).toEqual([]);
    expect(trace.dbQueryCount).toBe(0);
    expect(trace.cacheHits).toBe(0);
    expect(traceAggregator.snapshot().endpoints).toEqual([]);
  });

  test("full mode still aggregates", async () => {
    const trace = new SignalTrace("userList", "query", { mode: "full" });
    await runTraced(trace, async () => {
      getCurrentTrace()?.countDbQuery(3);
    });
    expect(trace.spans.map((span) => span.name)).toEqual(["total"]);
    expect(traceAggregator.snapshot().endpoints[0]?.endpoint).toBe("query:userList");
  });
});

describe("runTraced", () => {
  test("marks the outcome before the error reaches the caller, and finalizes after", async () => {
    const trace = new SignalTrace("userList", "query", { mode: "context" });
    const outcomeInCatch: (string | null)[] = [];
    await expect(
      runTraced(trace, async () => {
        throw new Error("boom");
      }).catch((error: unknown) => {
        outcomeInCatch.push(trace.outcome);
        throw error;
      }),
    ).rejects.toThrow("boom");
    expect(outcomeInCatch).toEqual(["error"]);
    expect(trace.error).toBeInstanceOf(Error);
  });

  test("a clean run is ok and the ambient trace is gone afterwards", async () => {
    const trace = new SignalTrace("userList", "query", { mode: "context" });
    await runTraced(trace, async () => {
      expect(getCurrentTrace()).toBe(trace);
    });
    expect(trace.outcome).toBe("ok");
    expect(getCurrentTrace()).toBeUndefined();
  });

  test("passes through with no trace", async () => {
    expect(await runTraced(null, async () => 7)).toBe(7);
  });
});

describe("log records inside a trace", () => {
  test("carry the traceId, endpoint and origin of the ambient trace", async () => {
    const entries: LoggerSinkEntry[] = [];
    const removeSink = Logger.addSink((entry) => void entries.push(entry));
    const trace = new SignalTrace("signScContract", "mutation", { mode: "context", origin: "mcp" });
    try {
      Logger.setLevel("error");
      await runTraced(trace, async () => {
        Logger.info("inside", "", "TraceTest");
      });
      Logger.info("outside", "", "TraceTest");
      expect(entries[0]?.record).toMatchObject({
        traceId: trace.traceId,
        endpoint: "mutation:signScContract",
        origin: "mcp",
      });
      expect(entries[1]?.record).toMatchObject({ traceId: null, endpoint: null, origin: null });
    } finally {
      removeSink();
      Logger.setLevel("info");
    }
  });
});

describe("canonical request line", () => {
  test("writes nothing by default", async () => {
    const sink = collect();
    try {
      await runTraced(new SignalTrace("refund", "mutation", { mode: "context" }), async () => undefined);
      expect(sink.canonical()).toEqual([]);
    } finally {
      sink.restore();
    }
  });

  test("`all` is one info line per call with timing, status and the attrs the call set", async () => {
    setCanonicalLineMode("all");
    const sink = collect();
    try {
      const trace = new SignalTrace("refund", "mutation", { mode: "context" });
      await runTraced(trace, async () => {
        trace.setAttr("userId", "u1");
      });
      const [line] = sink.canonical();
      expect(line?.record).toMatchObject({
        level: "info",
        message: "ok mutation:refund",
        traceId: trace.traceId,
        endpoint: "mutation:refund",
      });
      expect(line?.record.attrs).toMatchObject({ status: 200, userId: "u1" });
      expect(typeof line?.record.attrs?.ms).toBe("number");
    } finally {
      sink.restore();
    }
  });

  test("a failed call is a warn line carrying the error's status and first line", async () => {
    setCanonicalLineMode("all");
    const sink = collect();
    try {
      const trace = new SignalTrace("refund", "mutation", { mode: "context" });
      await expect(
        runTraced(trace, async () => {
          throw Object.assign(new Error("nope\n    at somewhere"), { statusCode: 403 });
        }),
      ).rejects.toThrow("nope");
      const [line] = sink.canonical();
      expect(line?.record).toMatchObject({ level: "warn", message: "error mutation:refund" });
      expect(line?.record.attrs).toMatchObject({ status: 403, err: "nope" });
    } finally {
      sink.restore();
    }
  });

  test("`slow` keeps only failed or over-threshold calls", async () => {
    setCanonicalLineMode("slow");
    const sink = collect();
    try {
      setFlightThresholdMs(60_000);
      await runTraced(new SignalTrace("fast", "query", { mode: "context" }), async () => undefined);
      expect(sink.canonical()).toEqual([]);
      setFlightThresholdMs(0);
      await runTraced(new SignalTrace("slow", "query", { mode: "context" }), async () => undefined);
      expect(sink.canonical().map((entry) => entry.record.message)).toEqual(["ok query:slow"]);
    } finally {
      sink.restore();
    }
  });

  test("full mode adds the db and cache figures", async () => {
    setCanonicalLineMode("all");
    const sink = collect();
    try {
      const trace = new SignalTrace("list", "query", { mode: "full" });
      await runTraced(trace, async () => {
        trace.countDbQuery(2);
        trace.countCache(true);
        trace.countCache(false);
      });
      expect(sink.canonical()[0]?.record.attrs).toMatchObject({ db: 1, dbMs: 2, cacheHit: 0.5 });
    } finally {
      sink.restore();
    }
  });
});

describe("flight recorder", () => {
  test("attaches under the switch and arms the Logger's context gate", () => {
    setFlightRecorderEnabled(true);
    const before = SignalTrace.activeFlights;
    const trace = SignalTrace.create("x", "query", "http");
    expect(trace?.flight?.minSev).toBe(logSeverity.trace);
    expect(Logger.contextGate).toBe(true);
    expect(SignalTrace.activeFlights).toBe(before + 1);
    trace?.finalize();
    expect(trace?.flight).toBeNull();
    expect(SignalTrace.activeFlights).toBe(before);
    setFlightRecorderEnabled(false);
    expect(SignalTrace.create("x", "query", "http")?.flight).toBeNull();
  });

  test("a clean fast call discards what it captured; a failed one promotes it to the console", async () => {
    setFlightRecorderEnabled(true);
    const removeSink = Logger.addSink(() => void undefined, { minLevel: "warn" });
    const stdout = captureStdout();
    try {
      Logger.setLevel("error");
      await runTraced(SignalTrace.create("x", "query", "http"), async () => {
        Logger.verbose("kept quiet", "", "Flight");
      });
      expect(stdout.writes).toEqual([]);
      await expect(
        runTraced(SignalTrace.create("x", "query", "http"), async () => {
          Logger.verbose("the clue", "", "Flight");
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(stdout.writes.length).toBe(1);
      expect(Logger.stripAnsi(stdout.writes[0] ?? "")).toContain("the clue flight=true");
    } finally {
      stdout.restore();
      removeSink();
      Logger.setLevel("info");
    }
  });

  test("a slow call promotes too, and a line already written is not written twice", async () => {
    setFlightRecorderEnabled(true);
    setFlightThresholdMs(0);
    const stdout = captureStdout();
    try {
      Logger.setLevel("info");
      await runTraced(SignalTrace.create("x", "query", "http"), async () => {
        Logger.verbose("detail", "", "Flight");
        Logger.info("shown", "", "Flight");
      });
      expect(stdout.writes.length).toBe(2);
      expect(stdout.writes[0]).toContain("shown");
      expect(Logger.stripAnsi(stdout.writes[1] ?? "")).toContain("detail flight=true");
    } finally {
      stdout.restore();
      Logger.setLevel("info");
    }
  });

  test("the ring keeps the newest 64 lines and says how many it dropped", async () => {
    setFlightRecorderEnabled(true);
    const stdout = captureStdout();
    try {
      Logger.setLevel("error");
      await expect(
        runTraced(SignalTrace.create("x", "query", "http"), async () => {
          for (let idx = 0; idx < 70; idx += 1) Logger.trace(`line ${idx}`, "", "Flight");
          throw new Error("boom");
        }),
      ).rejects.toThrow();
      expect(stdout.writes.length).toBe(64);
      expect(Logger.stripAnsi(stdout.writes[0] ?? "")).toContain("line 6 flight=true flightEvicted=6");
    } finally {
      stdout.restore();
      Logger.setLevel("info");
    }
  });

  test("past the process cap a call runs unrecorded", () => {
    const room = SignalTrace.defaultFlightMaxRecords / 64 - SignalTrace.activeFlights;
    const traces = Array.from({ length: room }, () => new SignalTrace("x", "query", { mode: "context" }));
    try {
      for (const trace of traces) expect(trace.startFlightRecorder()).toBe(true);
      expect(new SignalTrace("x", "query", { mode: "context" }).startFlightRecorder()).toBe(false);
    } finally {
      for (const trace of traces) trace.finalize();
    }
    expect(SignalTrace.activeFlights).toBe(0);
  });
});

describe("x-akan-debug", () => {
  const env = {
    AKAN_PUBLIC_ENV: process.env.AKAN_PUBLIC_ENV,
    AKAN_LOG_DEBUG_HEADER: process.env.AKAN_LOG_DEBUG_HEADER,
  };
  const restore = () => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  test("is honoured unconditionally in local", () => {
    process.env.AKAN_PUBLIC_ENV = "local";
    try {
      const trace = new SignalTrace("x", "query", { mode: "context" });
      expect(trace.applyDebugHeader(null)).toBe(false);
      expect(trace.applyDebugHeader("1")).toBe(true);
      expect(trace.debugSev).toBe(logSeverity.trace);
    } finally {
      restore();
    }
  });

  test("elsewhere only the shared secret opens it", () => {
    process.env.AKAN_PUBLIC_ENV = "main";
    delete process.env.AKAN_LOG_DEBUG_HEADER;
    try {
      expect(new SignalTrace("x", "query", { mode: "context" }).applyDebugHeader("1")).toBe(false);
      process.env.AKAN_LOG_DEBUG_HEADER = "s3cret";
      const trace = new SignalTrace("x", "query", { mode: "context" });
      expect(trace.applyDebugHeader("nope")).toBe(false);
      expect(trace.applyDebugHeader("s3cret")).toBe(true);
      expect(trace.debugSev).toBe(logSeverity.trace);
    } finally {
      restore();
    }
  });
});
