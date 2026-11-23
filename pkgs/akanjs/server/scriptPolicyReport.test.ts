import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { Logger } from "akanjs/common";
import { ScriptPolicyReport } from "./scriptPolicyReport";

const routeOf = (pathname: string) => (pathname.startsWith("/en/orders/") ? "/[lang]/orders/[orderId]" : undefined);
const post = (body: unknown, contentType: string) =>
  new Request(`http://shop.test${ScriptPolicyReport.path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": contentType },
  });

let emit: Mock<typeof Logger.emit>;
const lines = () => emit.mock.calls.map(([record]) => record.message ?? "");

beforeEach(() => {
  emit = spyOn(Logger, "emit").mockImplementation(() => undefined);
});
afterEach(() => emit.mockRestore());

describe("ScriptPolicyReport", () => {
  test("reads the report each browser sends, by report-uri and through the Reporting API", async () => {
    const firefox = {
      "csp-report": {
        "document-uri": "https://shop.test/en/orders/1?token=secret",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "blocked-uri": "inline",
        "source-file": "https://shop.test/en/orders/1?token=secret",
        "line-number": 12,
        "script-sample": "window.track()",
        disposition: "enforce",
      },
    };
    const webkitUri = {
      type: "csp-violation",
      url: "https://shop.test/en/orders/2",
      "csp-report": { "document-uri": "https://shop.test/en/orders/2", "effective-directive": "script-src-attr" },
    };
    const reporting = [
      {
        type: "csp-violation",
        url: "https://shop.test/en/cart",
        body: {
          documentURL: "https://shop.test/en/cart",
          effectiveDirective: "script-src-elem",
          blockedURL: "https://tags.example/loader.js?id=abc",
          disposition: "report",
        },
      },
      { type: "deprecation", url: "https://shop.test/en/cart", body: { id: "x" } },
    ];
    const webkitTo = {
      type: "csp-violation",
      url: "https://shop.test/en/help",
      body: { effectiveDirective: "wasm-eval" },
    };

    for (const [body, type] of [
      [firefox, "application/csp-report"],
      [webkitUri, "application/csp-report"],
      [reporting, "application/reports+json"],
      [webkitTo, "application/reports+json"],
    ] as const)
      expect((await ScriptPolicyReport.handle(post(body, type), routeOf)).status).toBe(204);

    expect(lines()).toEqual([
      "The script policy refused inline (script-src-elem) on /[lang]/orders/[orderId] at https://shop.test/en/orders/1:12: window.track()",
      "The script policy refused inline (script-src-attr) on /[lang]/orders/[orderId]",
      "The script policy would refuse https://tags.example/loader.js (script-src-elem) on /en/cart",
      "The script policy refused inline (wasm-eval) on /en/help",
    ]);
    expect(lines().join("\n")).not.toContain("secret");
  });

  test("logs a kind of violation once, whatever page of its route or visitor sends it", async () => {
    const report = (orderId: number) => ({
      "csp-report": {
        "document-uri": `https://shop.test/en/orders/${orderId}`,
        "effective-directive": "script-src-elem",
        "blocked-uri": "eval",
      },
    });
    for (const orderId of [10, 11, 12])
      await ScriptPolicyReport.handle(post(report(orderId), "application/csp-report"), routeOf);

    expect(lines()).toEqual(["The script policy refused eval (script-src-elem) on /[lang]/orders/[orderId]"]);
  });

  test("takes no control character, line break or long field into the log, and answers every post alike", async () => {
    const answers = await Promise.all([
      ScriptPolicyReport.handle(
        post(
          {
            "csp-report": {
              "document-uri": "https://shop.test/en/\u001b[31mred",
              "effective-directive": "script-src-elem",
              "script-sample": `a\nb\u0007${"x".repeat(500)}`,
            },
          },
          "application/csp-report",
        ),
        routeOf,
      ),
      ScriptPolicyReport.handle(post("{not json", "application/csp-report"), routeOf),
      ScriptPolicyReport.handle(
        post({ "csp-report": { "effective-directive": "x; y" } }, "application/csp-report"),
        routeOf,
      ),
      ScriptPolicyReport.handle(post({ "csp-report": { "effective-directive": "img-src" } }, "text/plain"), routeOf),
      ScriptPolicyReport.handle(post("x".repeat(ScriptPolicyReport.maxBodyBytes + 1), "application/json"), routeOf),
    ]);
    const [line = ""] = lines();

    expect(answers.map(({ status }) => status)).toEqual([204, 204, 204, 204, 204]);
    expect(await Promise.all(answers.map((answer) => answer.text()))).toEqual(["", "", "", "", ""]);
    expect(lines()).toHaveLength(1);
    expect([...line].filter((char) => char < " ")).toEqual([]);
    expect(line).toContain("a\\nb");
    expect(line.length).toBeLessThan(400);
  });

  test("answers only a post", async () => {
    const answer = await ScriptPolicyReport.handle(new Request(`http://shop.test${ScriptPolicyReport.path}`), routeOf);

    expect([answer.status, answer.headers.get("allow")]).toEqual([405, "POST"]);
  });

  test("stops logging after a bounded number of kinds, and says so once", async () => {
    const kinds = Array.from({ length: ScriptPolicyReport.maxGroups + 10 }, (_, index) => ({
      type: "csp-violation",
      body: { documentURL: `https://shop.test/en/page-${index}`, effectiveDirective: "script-src-elem" },
    }));
    for (let at = 0; at < kinds.length; at += 50)
      await ScriptPolicyReport.handle(post(kinds.slice(at, at + 50), "application/reports+json"), routeOf);
    const capped = lines().filter((line) => line.includes("logs no more"));

    expect(emit.mock.calls.length).toBeLessThanOrEqual(ScriptPolicyReport.maxGroups + 1);
    expect(capped).toHaveLength(1);
  });
});
