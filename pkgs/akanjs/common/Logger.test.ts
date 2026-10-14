import { describe, expect, test } from "bun:test";
import dayjs from "dayjs";
import { Logger, type LoggerSinkEntry, type LoggerSinkOptions, type LogRecord, logSeverity } from "./Logger";
import { type LogContextSnapshot, registerLogContextReader } from "./logContext";

const resetLoggerLevels = () => {
  Logger.setLevel("info");
  Logger.setFileLevel("trace");
};

const withSink = (run: (entries: LoggerSinkEntry[]) => void, options?: LoggerSinkOptions) => {
  const entries: LoggerSinkEntry[] = [];
  const removeSink = Logger.addSink((entry) => void entries.push(entry), options);
  try {
    run(entries);
  } finally {
    removeSink();
    resetLoggerLevels();
  }
};

const makeRecord = (over: Partial<LogRecord>): LogRecord => ({
  at: 1,
  elapsedMs: 0,
  level: "info",
  sev: logSeverity.info,
  name: "Flight",
  context: "",
  message: "",
  stream: "stdout",
  pid: 1,
  replicaIdx: null,
  role: null,
  origin: null,
  traceId: "t-1",
  endpoint: null,
  ...over,
});

describe("Logger sinks", () => {
  test("emits file sink entries independently from terminal log level", () =>
    withSink((entries) => {
      Logger.setLevel("error");
      Logger.setFileLevel("trace");
      Logger.trace("file only", "sink-test", "LoggerTest");

      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBe("trace");
      expect(entries[0]?.plainMessage.includes("file only")).toBe(true);
    }));

  test("filters sink entries with AKAN_LOG_FILE_LEVEL semantics", () =>
    withSink((entries) => {
      Logger.setLevel("error");
      Logger.setFileLevel("warn");
      Logger.info("skip file", "sink-test", "LoggerTest");
      Logger.warn("keep file", "sink-test", "LoggerTest");

      expect(entries.map((entry) => entry.level)).toEqual(["warn"]);
      expect(entries[0]?.plainMessage.includes("keep file")).toBe(true);
    }));

  test("a sink's own minLevel floors it independently of the file level", () => {
    const fileEntries: LoggerSinkEntry[] = [];
    const warnEntries: LoggerSinkEntry[] = [];
    const removeFile = Logger.addSink((entry) => void fileEntries.push(entry));
    const removeWarn = Logger.addSink((entry) => void warnEntries.push(entry), { minLevel: "warn" });

    try {
      Logger.setLevel("error");
      Logger.setFileLevel("trace");
      Logger.verbose("v", "", "LoggerTest");
      Logger.warn("w", "", "LoggerTest");

      expect(fileEntries.map((entry) => entry.level)).toEqual(["verbose", "warn"]);
      expect(warnEntries.map((entry) => entry.level)).toEqual(["warn"]);
    } finally {
      removeFile();
      removeWarn();
      resetLoggerLevels();
    }
  });

  test("nothing is built when every sink and the console reject the level", () =>
    withSink(
      (entries) => {
        Logger.setLevel("error");
        expect(Logger.shouldLog("info")).toBe(false);
        Logger.info("dropped", "", "LoggerTest");
        expect(entries).toEqual([]);
      },
      { minLevel: "warn" },
    ));

  test("raw lines reach every sink regardless of its floor", () => {
    const entries: LoggerSinkEntry[] = [];
    const removeSink = Logger.addSink((entry) => void entries.push(entry), { minLevel: "error" });

    try {
      Logger.raw("banner\n", "console");
      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBeUndefined();
      expect(entries[0]?.record.sev).toBe(0);
      expect(entries[0]?.message).toBe("banner\n");
    } finally {
      removeSink();
    }
  });

  test("an instance's raw writes the text as given and rawLog adds the line break, like the static pair", () =>
    withSink((entries) => {
      const logger = new Logger("Banner");
      logger.raw("progress", "console");
      logger.rawLog("done", "console");
      expect(entries.map((entry) => entry.message)).toEqual(["progress", "done\n"]);
    }));
});

describe("Logger levels", () => {
  test("log() emits at info and the legacy level name normalizes", () =>
    withSink((entries) => {
      Logger.setLevel("error");
      Logger.setFileLevel("log");
      expect(Logger.fileLevel).toBe("info");
      Logger.log("legacy", "", "LoggerTest");
      Logger.debug("below", "", "LoggerTest");

      expect(entries.map((entry) => entry.level)).toEqual(["info"]);
      expect(entries[0]?.record.sev).toBe(logSeverity.info);
    }));

  test("isVerbose follows the console level", () => {
    try {
      Logger.setLevel("verbose");
      expect(Logger.isVerbose()).toBe(true);
      Logger.setLevel("debug");
      expect(Logger.isVerbose()).toBe(false);
    } finally {
      resetLoggerLevels();
    }
  });
});

describe("Logger records", () => {
  test("renders the record into the historical console line", () => {
    const at = dayjs("2026-01-02T15:04:05.000").valueOf();
    const record = makeRecord({
      at,
      elapsedMs: 4_200,
      level: "warn",
      sev: logSeverity.warn,
      name: "LoggerTest",
      context: "ctx",
      message: "hello",
      pid: 123,
      replicaIdx: 2,
      traceId: null,
    });
    const yellow = (text: string) => `\x1B[33m${text}\x1B[39m`;
    const rendered = Logger.render(record);
    const [head, tail] = rendered.split(" \x1B[33m+");
    expect(head).toBe(
      `${yellow("[LoggerTest] #2 123 -")} ${dayjs(at).format("MM/DD/YYYY, HH:mm:ss A")} ${yellow("   WARN")} ${yellow("[ctx] ")} ${yellow("hello")}`,
    );
    expect(tail).toBe(`4200ms${"\x1B"}[39m\n`);
  });

  test("sink entries expose the record and render text on demand", () =>
    withSink((entries) => {
      Logger.setLevel("error");
      Logger.info("structured", "ctx", "LoggerTest");
      const entry = entries[0];
      expect(entry?.record).toMatchObject({
        level: "info",
        sev: logSeverity.info,
        name: "LoggerTest",
        context: "ctx",
        message: "structured",
        stream: "stdout",
        pid: process.pid,
      });
      expect(entry?.message).toBe(Logger.render(entry?.record as LogRecord));
      expect(entry?.plainMessage).toContain("[LoggerTest]");
      expect(entry?.plainMessage).not.toContain("\x1B");
    }));

  test("records carry whatever the registered context reader returns", () => {
    const entries: LoggerSinkEntry[] = [];
    const removeSink = Logger.addSink((entry) => void entries.push(entry));
    registerLogContextReader(() => ({ traceId: "t-1", endpoint: "mutation:signScContract", origin: "http" }));

    try {
      Logger.setLevel("error");
      Logger.info("in context", "", "LoggerTest");
      expect(entries[0]?.record).toMatchObject({ traceId: "t-1", endpoint: "mutation:signScContract", origin: "http" });
    } finally {
      registerLogContextReader(null);
      removeSink();
      resetLoggerLevels();
    }
  });
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

const snapshot = (over: Partial<LogContextSnapshot>): LogContextSnapshot => ({
  traceId: "t-1",
  endpoint: "query:x",
  origin: "http",
  ...over,
});

describe("Logger attrs", () => {
  test("emit renders attrs as key=value after the message and redacts secret-named keys", () =>
    withSink((entries) => {
      Logger.setLevel("error");
      Logger.emit({
        level: "info",
        name: "Signal",
        message: "ok mutation:refund",
        attrs: { ms: 12.5, status: 200, err: "not now", apiKey: "k" },
      });
      expect(entries[0]?.record.attrs).toEqual({ ms: 12.5, status: 200, err: "not now", apiKey: "[redacted]" });
      expect(entries[0]?.plainMessage).toContain(
        'ok mutation:refund ms=12.5 status=200 err="not now" apiKey=[redacted] +',
      );
    }));

  test("a record without attrs keeps the historical line", () =>
    withSink((entries) => {
      Logger.setLevel("error");
      Logger.info("plain", "", "LoggerTest");
      expect(entries[0]?.record.attrs).toBeUndefined();
      expect(entries[0]?.plainMessage).toMatch(/ plain \+\d+ms\n$/);
    }));
});

describe("Logger context gate", () => {
  test("a flight recorder receives every record below the gate without it being written", () => {
    const captured: [string, boolean][] = [];
    const entries: LoggerSinkEntry[] = [];
    const removeSink = Logger.addSink((entry) => void entries.push(entry), { minLevel: "warn" });
    registerLogContextReader(() =>
      snapshot({
        flight: { minSev: logSeverity.trace, capture: (record, written) => captured.push([record.message, written]) },
      }),
    );
    Logger.contextGate = true;
    try {
      Logger.setLevel("error");
      expect(Logger.shouldLog("trace")).toBe(true);
      Logger.trace("t", "", "GateTest");
      Logger.warn("w", "", "GateTest");
      expect(captured).toEqual([
        ["t", false],
        ["w", true],
      ]);
      expect(entries.map((entry) => entry.record.message)).toEqual(["w"]);
    } finally {
      Logger.contextGate = false;
      registerLogContextReader(null);
      removeSink();
      resetLoggerLevels();
    }
  });

  test("the gate is untouched while nothing arms it", () => {
    registerLogContextReader(() => snapshot({ flight: { minSev: logSeverity.trace, capture: () => undefined } }));
    try {
      Logger.setLevel("error");
      expect(Logger.shouldLog("trace")).toBe(false);
    } finally {
      registerLogContextReader(null);
      resetLoggerLevels();
    }
  });

  test("a per-request debug floor writes below the level to the console and through every sink floor, marked debug", () => {
    const all: LoggerSinkEntry[] = [];
    const warnOnly: LoggerSinkEntry[] = [];
    const removeAll = Logger.addSink((entry) => void all.push(entry));
    const removeWarn = Logger.addSink((entry) => void warnOnly.push(entry), { minLevel: "warn" });
    registerLogContextReader(() => snapshot({ debugSev: logSeverity.trace }));
    Logger.contextGate = true;
    const stdout = captureStdout();
    try {
      Logger.setLevel("error");
      Logger.debug("d", "", "GateTest");
      Logger.error("e", "", "GateTest");
      expect(stdout.writes.length).toBe(1);
      expect(all.map((entry) => entry.record.message)).toEqual(["d", "e"]);
      expect(all[0]?.record.attrs).toEqual({ debug: true });
      expect(all[1]?.record.attrs).toBeUndefined();
      expect(warnOnly.map((entry) => entry.record.message)).toEqual(["d", "e"]);
    } finally {
      stdout.restore();
      Logger.contextGate = false;
      registerLogContextReader(null);
      removeAll();
      removeWarn();
      resetLoggerLevels();
    }
  });
});

describe("Logger replay", () => {
  const record = (level: "trace" | "verbose", message: string) =>
    makeRecord({ level, sev: logSeverity[level], message });

  test("promoted records bypass the console level and every sink floor, and are marked flight", () => {
    const entries: LoggerSinkEntry[] = [];
    const removeSink = Logger.addSink((entry) => void entries.push(entry), { minLevel: "warn" });
    const stdout = captureStdout();
    try {
      Logger.setLevel("error");
      Logger.replay([record("trace", "t"), record("verbose", "v")], { evicted: 3 });
      expect(stdout.writes.length).toBe(2);
      expect(Logger.stripAnsi(stdout.writes[0] ?? "")).toContain("t flight=true flightEvicted=3");
      expect(entries.map((entry) => entry.record.message)).toEqual(["t", "v"]);
      expect(entries[1]?.record.attrs).toEqual({ flight: true });
    } finally {
      stdout.restore();
      removeSink();
      resetLoggerLevels();
    }
  });

  test("consoleOutput off keeps promoted and raw lines off the terminal", () => {
    const stdout = captureStdout();
    Logger.consoleOutput = false;
    try {
      Logger.replay([record("trace", "t")]);
      Logger.raw("banner\n");
      Logger.setLevel("trace");
      Logger.info("i", "", "LoggerTest");
      expect(stdout.writes).toEqual([]);
      expect(Logger.shouldLog("info")).toBe(false);
    } finally {
      Logger.consoleOutput = true;
      stdout.restore();
      resetLoggerLevels();
    }
  });
});

describe("Logger in a gateway's child", () => {
  // The gateway prints a spawned child's stdout and keeps its stderr to the log file unless asked.
  const run = (env: Record<string, string>) => {
    const logger = new URL("./Logger.ts", import.meta.url).href;
    const script = `const { Logger } = await import(${JSON.stringify(logger)}); Logger.error("boom"); Logger.rawLog("raw", "process", "error");`;
    const proc = Bun.spawnSync(["bun", "-e", script], {
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
    return { stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
  };

  test("writes its error lines to stdout when the gateway hides its stderr", () => {
    const hidden = run({ AKAN_CHILD_STDERR_HIDDEN: "1" });
    expect(hidden.stdout).toContain("boom");
    expect(hidden.stdout).toContain("raw");
    expect(hidden.stderr).toBe("");
    const shown = run({ AKAN_CHILD_STDERR_HIDDEN: "" });
    expect(shown.stderr).toContain("boom");
    expect(shown.stdout).not.toContain("boom");
  });
});
