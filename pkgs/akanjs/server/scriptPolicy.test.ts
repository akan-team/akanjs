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

describe("ScriptPolicy report-only header", () => {
  test("names the nonce and each hash once, between 'self' and 'strict-dynamic'", () => {
    expect(
      ScriptPolicy.reportOnly({ nonce: "n1", hashes: ["'sha256-a'", "'sha256-b'", "'sha256-a'"] }, production),
    ).toBe("script-src 'self' 'nonce-n1' 'sha256-a' 'sha256-b' 'strict-dynamic'");
    expect(ScriptPolicy.reportOnly({}, production)).toBe("script-src 'self' 'strict-dynamic'");
  });

  test("allows evaluation only outside a production build", () => {
    expect(ScriptPolicy.reportOnly({}, { NODE_ENV: "development" })).toBe(
      "script-src 'self' 'strict-dynamic' 'unsafe-eval'",
    );
    expect(ScriptPolicy.reportOnly({}, { NODE_ENV: "production", AKAN_COMMAND_TYPE: "start" })).toBe(
      "script-src 'self' 'strict-dynamic' 'unsafe-eval'",
    );
  });

  test("is dropped by `off` and replaced as written by any other value", () => {
    for (const off of ["off", "false", "0", "none", "OFF"])
      expect(
        ScriptPolicy.reportOnly({ nonce: "n1" }, { ...production, AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY: off }),
      ).toBeNull();
    expect(
      ScriptPolicy.reportOnly(
        { nonce: "n1" },
        { ...production, AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY: " default-src 'self' " },
      ),
    ).toBe("default-src 'self'");
    expect(
      ScriptPolicy.reportOnly({}, { ...production, AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY: "a\r\nSet-Cookie: x=1" }),
    ).toBe("script-src 'self' 'strict-dynamic'");
  });

  test("adds the sources AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC names, and none that could end the directive", () => {
    const hash = "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='";
    const policyOf = (value: string) =>
      ScriptPolicy.reportOnly({ nonce: "n1" }, { ...production, AKAN_CONTENT_SECURITY_POLICY_SCRIPT_SRC: value });

    expect(policyOf(`'wasm-unsafe-eval'  ${hash} https://cdn.example.com`)).toBe(
      `script-src 'self' 'nonce-n1' 'wasm-unsafe-eval' ${hash} https://cdn.example.com 'strict-dynamic'`,
    );
    expect(policyOf("'wasm-unsafe-eval'; default-src * 'a\"b' x,y")).toBe(
      "script-src 'self' 'nonce-n1' default-src * 'strict-dynamic'",
    );
    expect(policyOf("off")).toBe("script-src 'self' 'nonce-n1' 'strict-dynamic'");
  });

  test("sends reports to AKAN_CONTENT_SECURITY_POLICY_REPORT_URI, by both directives", () => {
    const env = { ...production, AKAN_CONTENT_SECURITY_POLICY_REPORT_URI: "/api/csp-report" };

    expect(ScriptPolicy.reportOnly({}, env)).toBe(
      "script-src 'self' 'strict-dynamic'; report-uri /api/csp-report; report-to akan-csp",
    );
    for (const refused of ["/a b", "/a;script-src *", '/a"', "/a,b", "off"])
      expect(ScriptPolicy.reportOnly({}, { ...production, AKAN_CONTENT_SECURITY_POLICY_REPORT_URI: refused })).toBe(
        "script-src 'self' 'strict-dynamic'",
      );
  });

  test("sets the report-only header beside the endpoint it reports to, and nothing when it is off", () => {
    const saved = {
      uri: process.env.AKAN_CONTENT_SECURITY_POLICY_REPORT_URI,
      policy: process.env.AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY,
      nodeEnv: process.env.NODE_ENV,
    };
    try {
      process.env.NODE_ENV = "production";
      delete process.env.AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY;
      process.env.AKAN_CONTENT_SECURITY_POLICY_REPORT_URI = "https://reports.example/csp";
      expect(Object.fromEntries(ScriptPolicy.apply(new Headers(), { nonce: "n1" }))).toEqual({
        "content-security-policy-report-only":
          "script-src 'self' 'nonce-n1' 'strict-dynamic'; report-uri https://reports.example/csp; report-to akan-csp",
        "reporting-endpoints": 'akan-csp="https://reports.example/csp"',
      });
      process.env.AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY = "off";
      expect(Object.fromEntries(ScriptPolicy.apply(new Headers(), { nonce: "n1" }))).toEqual({});
    } finally {
      for (const [key, value] of [
        ["AKAN_CONTENT_SECURITY_POLICY_REPORT_URI", saved.uri],
        ["AKAN_CONTENT_SECURITY_POLICY_REPORT_ONLY", saved.policy],
        ["NODE_ENV", saved.nodeEnv],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("keeps a response's hash list under what a proxy's header buffer holds", () => {
    const policy = ScriptPolicy.reportOnly(
      { nonce: "n".repeat(24), hashes: Array.from({ length: MAX_RESPONSE_SCRIPT_HASHES }, (_, i) => sha256(`${i}`)) },
      production,
    );

    expect(policy?.length).toBeLessThan(2048);
  });
});
