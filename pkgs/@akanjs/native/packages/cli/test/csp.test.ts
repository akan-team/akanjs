import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  buildCsp,
  cspHash,
  injectCspMeta,
  inlineBlocks,
  parseCsp,
  STRICT_CSP,
  serializeCsp,
  validateCsp,
  validateExternalSchemes,
} from "../src/lib/csp.ts";
import { injectInitScript } from "../src/lib/html.ts";

const sha = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>t</title><style>body{color:red}</style></head>
<body><div id="root"></div><script type="module">const s = "<script>not a tag"; console.log(s + "<\\/script>");</script>
<script type="application/ld+json">{"a":1}</script><script src="/x.js"></script></body></html>`;

describe("CSP hashes (SEC-4)", () => {
  test("hashes the exact text, with CRLF and CR normalized like the HTML parser", () => {
    expect(cspHash("alert(1)")).toBe(sha("alert(1)"));
    expect(cspHash("a\r\nb\rc")).toBe(sha("a\nb\nc"));
    // Known value from the CSP spec examples (sha256 of "alert('Hello, world.');").
    expect(cspHash("alert('Hello, world.');")).toBe("'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='");
  });

  test("finds inline scripts and styles the way the tokenizer does", () => {
    const { scripts, styles } = inlineBlocks(PAGE);
    expect(styles).toEqual(["body{color:red}"]);
    // The module ends at the first </script; "<script" inside it is text. External scripts are skipped.
    expect(scripts).toEqual([`const s = "<script>not a tag"; console.log(s + "<\\/script>");`, `{"a":1}`]);
  });
});

describe("CSP policy (SEC-4)", () => {
  test("strict preset plus hashes", () => {
    const { policy, scripts, styles, warnings } = buildCsp("strict", PAGE);
    expect([scripts, styles, warnings]).toEqual([2, 1, []]);
    const map = parseCsp(policy);
    expect(map.get("script-src")).toEqual(["'self'", ...inlineBlocks(PAGE).scripts.map(cspHash)]);
    expect(map.get("style-src")).toEqual(["'self'", cspHash("body{color:red}")]);
    expect(map.get("img-src")).toEqual(STRICT_CSP["img-src"]);
    expect(map.get("object-src")).toEqual(["'none'"]);
  });

  test("missing script-src/style-src start from default-src, so no allowed source is lost", () => {
    const map = parseCsp(buildCsp("default-src 'self' https://cdn.example.com; img-src *", PAGE).policy);
    expect(map.get("script-src")?.slice(0, 2)).toEqual(["'self'", "https://cdn.example.com"]);
    expect(map.get("style-src")?.[1]).toBe("https://cdn.example.com");
    expect(map.get("img-src")).toEqual(["*"]);
  });

  test("'unsafe-inline' is left alone (hashes would disable it); 'none' makes room for hashes", () => {
    const built = buildCsp(
      { "default-src": "'self'", "style-src": ["'self'", "'unsafe-inline'"], "script-src": "'none'" },
      PAGE,
    );
    const map = parseCsp(built.policy);
    expect(map.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(map.get("script-src")?.[0]).toMatch(/^'sha256-/);
    expect(built.warnings.join()).toContain("'unsafe-inline'");
  });

  test("header-only directives are dropped from the meta policy with a warning", () => {
    const built = buildCsp("default-src 'self'; frame-ancestors 'none'; report-uri /r", "<html><head></head></html>");
    expect(built.policy).toBe("default-src 'self'");
    expect(built.warnings).toHaveLength(2);
  });

  test("parse and serialize; the first duplicate directive wins", () => {
    const map = parseCsp(" default-src 'self' ; SCRIPT-SRC a b; script-src c;upgrade-insecure-requests");
    expect([...map.keys()]).toEqual(["default-src", "script-src", "upgrade-insecure-requests"]);
    expect(serializeCsp(map)).toBe("default-src 'self'; script-src a b; upgrade-insecure-requests");
  });

  test("validation", () => {
    expect(validateCsp(undefined)).toBeUndefined();
    expect(validateCsp("strict")).toBe("strict");
    expect(validateCsp({ "img-src": ["'self'"] })).toEqual({ "img-src": ["'self'"] });
    for (const bad of ["", 3, [], { "img-src": 1 }, { "bad name": "x" }]) expect(() => validateCsp(bad)).toThrow();
  });
});

describe("CSP meta (SEC-4)", () => {
  test("after <meta charset>, before styles and the bundle; init.js may come first", () => {
    const html = injectInitScript(PAGE);
    const out = injectCspMeta(html, "default-src 'self'");
    const meta = out.indexOf('<meta http-equiv="Content-Security-Policy"');
    expect(meta).toBeGreaterThan(out.indexOf('<meta charset="utf-8">'));
    expect(meta).toBeLessThan(out.indexOf("<style>"));
    expect(out.indexOf("__akan_native/init.js")).toBeLessThan(meta);
  });

  test("first in <head> when a governed element comes before the charset; attribute is escaped", () => {
    const out = injectCspMeta(`<html><head><style>a{}</style><meta charset="utf-8"></head></html>`, `a "b" & c`);
    expect(out).toStartWith(
      `<html><head><meta http-equiv="Content-Security-Policy" content="a &quot;b&quot; &amp; c">`,
    );
  });

  test("an existing CSP meta is an error; no <head> is an error", () => {
    expect(() =>
      injectCspMeta(`<html><head><meta http-equiv="content-security-policy" content="x"></head></html>`, "y"),
    ).toThrow();
    expect(() => injectCspMeta(`<html><body></body></html>`, "y")).toThrow();
  });
});

test("security.shell.externalSchemes: lowercase schemes, never the ones that reach files or run script (L0)", () => {
  expect(validateExternalSchemes(undefined)).toEqual([]);
  expect(validateExternalSchemes(["sms", "otherapp", "sms"])).toEqual(["sms", "otherapp"]);
  expect(() => validateExternalSchemes(["sms:"])).toThrow('write "sms", not "sms:"');
  expect(() => validateExternalSchemes(["SMS"])).toThrow("lowercase URL scheme");
  for (const bad of ["javascript", "file", "intent", "app"])
    expect(() => validateExternalSchemes([bad])).toThrow("can never leave the app");
  expect(() => validateExternalSchemes("sms")).toThrow("must be an array");
});
