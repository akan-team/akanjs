import { describe, expect, test } from "bun:test";
import { logSeverity } from "akanjs/common";
import { HubFileSink } from "./hubFileSink";
import { LogHub } from "./logHub";
import { makeLogRecord as record } from "./logRecord.fixture";
import type { RotatingLogWriter } from "./rotatingLogWriter";

describe("HubFileSink", () => {
  test("writes every request line, and folds a storm of identical lines as the ring does", () => {
    const hub = new LogHub({ now: () => 10_000 });
    const lines: string[] = [];
    const writer = { write: (_key: string, line: string) => void lines.push(line) } as unknown as RotatingLogWriter;
    const sink = new HubFileSink(hub, writer, { minSev: logSeverity.info, json: true });
    for (let idx = 0; idx < 50; idx += 1)
      hub.ingest(record("ok query:userList", { name: "Signal", attrs: { ms: idx, status: 200 } }));
    for (let idx = 0; idx < 1_000; idx += 1) hub.ingest(record("loop warn", { level: "warn", sev: logSeverity.warn }));
    hub.close();
    sink.close();

    const messages = lines.map((line) => (JSON.parse(line) as { message: string }).message);
    expect(messages.filter((message) => message === "ok query:userList")).toHaveLength(50);
    expect(messages.filter((message) => message === "loop warn")).toHaveLength(LogHub.defaultSuppressPerSecond);
    expect(messages.at(-1)).toBe("loop warn (suppressed 980 identical lines within 1s)");
  });
});
