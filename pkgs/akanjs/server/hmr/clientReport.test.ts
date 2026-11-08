import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { Logger, type LogRecord } from "akanjs/common";
import { ClientReport } from "./clientReport";
import { HmrWsHub } from "./wsHub";

const records: LogRecord[] = [];
const stop = Logger.addSink((entry) => void records.push(entry.record));
afterEach(() => {
  records.length = 0;
});
afterAll(stop);

describe("ClientReport", () => {
  test("refuses a frame that is not a well-formed report", () => {
    expect(ClientReport.parse({ type: "client-report", kind: "error", message: "x", href: "/" })).toBeNull();
    expect(
      ClientReport.parse({ type: "client-report", kind: "crash", message: "x", href: "/", client: "ssr" }),
    ).toBeNull();
    expect(ClientReport.parse({ type: "sync-navigation", clientId: "a", href: "/" })).toBeNull();
  });

  test("strips terminal escapes and keeps the top of the stack", () => {
    const report = ClientReport.parse({
      type: "client-report",
      kind: "error",
      message: "TypeError: x is not a function\u001b[2J\u0007",
      stack: "TypeError: x is not a function\n    at Board (http://localhost:8282/board.js:3:9)\n    at render",
      href: "/en/board",
      client: "csr",
      platform: "android",
      target: "lu",
    });
    expect(report).not.toBeNull();
    expect(ClientReport.describe(report as NonNullable<typeof report>)).toBe(
      [
        "Uncaught error on /en/board (csr android lu): TypeError: x is not a function",
        "    at Board (http://localhost:8282/board.js:3:9)",
        "    at render",
      ].join("\n"),
    );
  });

  test("keeps the head on one line, so no field can start a line of its own", () => {
    const report = ClientReport.parse({
      type: "client-report",
      kind: "error",
      message: "boom\n[Gateway] 1 - ready\r next\u0085",
      stack: "boom\n[Gateway] 2 - ready\n    at render",
      href: "/en/\n[Gateway] 3",
      client: "csr",
      platform: "ios x",
      target: "lu\nx",
    });
    expect(report).not.toBeNull();
    const lines = ClientReport.describe(report as NonNullable<typeof report>).split("\n");
    expect(lines[0]).toBe(
      "Uncaught error on /en/\\n[Gateway] 3 (csr ios\\nx lu\\nx): boom\\n[Gateway] 1 - ready\\nnext",
    );
    expect(lines.slice(1).every((line) => line.startsWith("    "))).toBe(true);
  });

  test("the HMR hub logs a report even with sync navigation off", () => {
    const hub = new HmrWsHub();
    hub.handleMessage(
      JSON.stringify({ type: "client-report", kind: "rejection", message: "denied", href: "/en/", client: "ssr" }),
    );
    hub.handleMessage("not json");

    const logged = records.filter((record) => record.name === "ClientReport");
    expect(logged).toEqual([
      expect.objectContaining({
        level: "error",
        message: "Unhandled rejection on /en/ (ssr): denied",
        attrs: expect.objectContaining({ kind: "rejection", href: "/en/", client: "ssr" }),
      }),
    ]);
  });
});
