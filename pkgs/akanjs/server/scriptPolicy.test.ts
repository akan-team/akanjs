import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { MAX_RESPONSE_SCRIPT_HASHES, ScriptPolicy } from "./scriptPolicy";

const sha256 = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
const production = { NODE_ENV: "production" };

describe("ScriptPolicy hashes", () => {
  test("hashes the text a browser hashes, in which a CRLF and a lone CR are a line feed", () => {
    expect(ScriptPolicy.hashOf("a()\r\nb()\rc()")).toBe(sha256("a()\nb()\nc()"));
    expect(ScriptPolicy.hashOf("한글()")).toBe(sha256("한글()"));
  });

  test("reads a script's text up to the first closing tag, whatever tags the text itself names", () => {
    const html = [
      `<head><script>var a = "<script>alert(1)<\\/script>";</script>`,
      `<script src="/a.js"></script>`,
      `<script type="application/json" data-akan="t">[1,"\\u003cscript\\u003e"]</script>`,
      `<script type="module" nonce="n1">import "/b.js";</SCRIPT >`,
      `<script type="importmap">{"imports":{}}</script></head>`,
    ].join("");

    expect(ScriptPolicy.inlineScriptsOf(html).map(({ text }) => text)).toEqual([
      `var a = "<script>alert(1)<\\/script>";`,
      `[1,"\\u003cscript\\u003e"]`,
      `import "/b.js";`,
      `{"imports":{}}`,
    ]);
    expect(ScriptPolicy.hashesOf(html)).toEqual([
      sha256(`var a = "<script>alert(1)<\\/script>";`),
      sha256(`import "/b.js";`),
      sha256(`{"imports":{}}`),
    ]);
  });

  test("names by hash only the scripts that carry the render's nonce", () => {
    const page = new TextEncoder().encode(
      [
        `<script nonce="n1">$RC("B:0","S:0")</script>`,
        `<script nonce="other">stolen()</script>`,
        `<script>echoed()</script>`,
        `<script nonce="n1" src="/c.js"></script>`,
        `<script nonce="n1">$RC("B:0","S:0")</script>`,
        `<script nonce="n1" id="_R_">한글()</script>`,
      ].join("<p>…</p>"),
    );

    expect(ScriptPolicy.hashesOfNonced(page, "n1")).toEqual([sha256(`$RC("B:0","S:0")`), sha256("한글()")]);
    expect(ScriptPolicy.hashesOfNonced(page, "absent")).toEqual([]);
  });

  test("takes a hash source quoted or bare, and nothing that could add a second source or directive", () => {
    const hash = "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";

    expect(ScriptPolicy.hashSource(hash)).toBe(`'${hash}'`);
    expect(ScriptPolicy.hashSource(` '${hash}' `)).toBe(`'${hash}'`);
    expect(ScriptPolicy.hashSource("sha384-abc")).toBe("'sha384-abc'");
    for (const refused of [
      "'unsafe-inline'",
      "https://cdn.example",
      `${hash} 'unsafe-inline'`,
      `${hash}; x`,
      "md5-abc",
    ])
      expect(ScriptPolicy.hashSource(refused)).toBeNull();
  });
});

describe("ScriptPolicy header", () => {
  const own = { directives: "frame-ancestors 'self'; base-uri 'self'", own: true };
  const report = "report-uri /_akan/csp-report; report-to akan-csp";
  const endpoint = 'akan-csp="/_akan/csp-report"';

  test("names the nonce and each hash once, between 'self' and 'strict-dynamic', and allows WebAssembly", () => {
    expect(
      ScriptPolicy.scriptSrc({ nonce: "n1", hashes: ["'sha256-a'", "'sha256-b'", "'sha256-a'"] }, production),
    ).toBe("script-src 'self' 'nonce-n1' 'sha256-a' 'sha256-b' 'strict-dynamic' 'wasm-unsafe-eval'");
    expect(ScriptPolicy.scriptSrc({}, production)).toBe("script-src 'self' 'strict-dynamic' 'wasm-unsafe-eval'");
  });

  test("allows evaluation only outside a production build", () => {
    expect(ScriptPolicy.scriptSrc({}, { NODE_ENV: "development" })).toBe(
      "script-src 'self' 'strict-dynamic' 'wasm-unsafe-eval' 'unsafe-eval'",
    );
    expect(ScriptPolicy.scriptSrc({}, { NODE_ENV: "production", AKAN_COMMAND_TYPE: "start" })).toBe(
      "script-src 'self' 'strict-dynamic' 'wasm-unsafe-eval' 'unsafe-eval'",
    );
  });

  test("enforces the script policy after the response's other directives, reporting to the framework's receiver", () => {
    expect(ScriptPolicy.headersOf({ nonce: "n1" }, own, production)).toEqual({
      "Content-Security-Policy": `frame-ancestors 'self'; base-uri 'self'; script-src 'self' 'nonce-n1' 'strict-dynamic' 'wasm-unsafe-eval'; ${report}`,
      "Reporting-Endpoints": endpoint,
    });
  });

  test("moves the script policy into the report-only header for `on`, and takes any other value as a policy of its own", () => {
    const withSetting = (value: string) =>
      ScriptPolicy.headersOf({ nonce: "n1" }, own, { ...production, AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY: value });
    const enforced = `frame-ancestors 'self'; base-uri 'self'; script-src 'self' 'nonce-n1' 'strict-dynamic' 'wasm-unsafe-eval'; ${report}`;

    for (const on of ["on", "true", "1", "ON"])
      expect(withSetting(on)).toEqual({
        "Content-Security-Policy": "frame-ancestors 'self'; base-uri 'self'",
        "Content-Security-Policy-Report-Only": `script-src 'self' 'nonce-n1' 'strict-dynamic' 'wasm-unsafe-eval'; ${report}`,
        "Reporting-Endpoints": endpoint,
      });
    for (const off of ["off", "false", "0", "none"])
      expect(withSetting(off)).toEqual({ "Content-Security-Policy": enforced, "Reporting-Endpoints": endpoint });
    expect(withSetting(" require-trusted-types-for 'script' ")).toEqual({
      "Content-Security-Policy": enforced,
      "Content-Security-Policy-Report-Only": "require-trusted-types-for 'script'",
      "Reporting-Endpoints": endpoint,
    });
    expect(withSetting("a\r\nSet-Cookie: x=1")).toEqual({
      "Content-Security-Policy": enforced,
      "Reporting-Endpoints": endpoint,
    });
  });

  test("sends a policy the operator wrote as written, with the script policy reporting beside it", () => {
    const written = { directives: "frame-ancestors https://partner.example", own: false };
    const script = `script-src 'self' 'nonce-n1' 'strict-dynamic' 'wasm-unsafe-eval'; ${report}`;

    expect(ScriptPolicy.headersOf({ nonce: "n1" }, written, production)).toEqual({
      "Content-Security-Policy": "frame-ancestors https://partner.example",
      "Content-Security-Policy-Report-Only": script,
      "Reporting-Endpoints": endpoint,
    });
    expect(ScriptPolicy.headersOf({ nonce: "n1" }, { directives: null, own: false }, production)).toEqual({
      "Content-Security-Policy-Report-Only": script,
      "Reporting-Endpoints": endpoint,
    });
    expect(
      ScriptPolicy.headersOf({ nonce: "n1" }, written, {
        ...production,
        AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY: "off",
      }),
    ).toEqual({ "Content-Security-Policy": "frame-ancestors https://partner.example" });
  });

  test("takes its added sources from AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC, and none that could end the directive", () => {
    const hash = "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='";
    const policyOf = (value: string) =>
      ScriptPolicy.scriptSrc({ nonce: "n1" }, { ...production, AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC: value });

    expect(policyOf(`'wasm-unsafe-eval'  ${hash} https://cdn.example.com`)).toBe(
      `script-src 'self' 'nonce-n1' 'strict-dynamic' 'wasm-unsafe-eval' ${hash} https://cdn.example.com`,
    );
    expect(policyOf(hash)).toBe(`script-src 'self' 'nonce-n1' 'strict-dynamic' ${hash}`);
    expect(policyOf("'wasm-unsafe-eval'; default-src * 'a\"b' x,y")).toBe(
      "script-src 'self' 'nonce-n1' 'strict-dynamic' default-src *",
    );
    expect(policyOf("off")).toBe("script-src 'self' 'nonce-n1' 'strict-dynamic'");
  });

  test("reports to AKAN_CONTENT_SECURITY_POLICY_REPORT_URI by both directives, and to nothing when it is off", () => {
    const withUri = (value: string) =>
      ScriptPolicy.headersOf({}, own, { ...production, AKAN_CONTENT_SECURITY_POLICY_REPORT_URI: value });

    expect(withUri("https://reports.example/csp")).toEqual({
      "Content-Security-Policy":
        "frame-ancestors 'self'; base-uri 'self'; script-src 'self' 'strict-dynamic' 'wasm-unsafe-eval'; report-uri https://reports.example/csp; report-to akan-csp",
      "Reporting-Endpoints": 'akan-csp="https://reports.example/csp"',
    });
    for (const refused of ["/a b", "/a;script-src *", '/a"', "/a,b", "off", "none"])
      expect(withUri(refused)).toEqual({
        "Content-Security-Policy":
          "frame-ancestors 'self'; base-uri 'self'; script-src 'self' 'strict-dynamic' 'wasm-unsafe-eval'",
      });
  });

  test("keeps a response's policy under what a proxy's header buffer holds", () => {
    const hashes = Array.from({ length: MAX_RESPONSE_SCRIPT_HASHES }, (_, i) => sha256(`${i}`));
    const headers = ScriptPolicy.headersOf({ nonce: "n".repeat(24), hashes }, own, { NODE_ENV: "development" });

    expect(Object.values(headers).join("").length).toBeLessThan(2048);
  });
});
