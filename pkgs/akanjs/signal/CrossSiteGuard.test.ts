import { afterEach, describe, expect, test } from "bun:test";
import { CrossSiteGuard } from "./CrossSiteGuard";

const assert = (headers: Record<string, string>, requestUrl = "http://akan-child/api/signinAdmin") => {
  const req = new Request(requestUrl, { method: "POST", headers });
  CrossSiteGuard.assertOrigin(req, new URL(req.url), "signinAdmin");
};

describe("CrossSiteGuard", () => {
  afterEach(() => {
    CrossSiteGuard.reset();
  });

  test("allows a request with no Origin header", () => {
    expect(() => assert({ host: "app.example.com" })).not.toThrow();
  });

  test("refuses the opaque origin a sandboxed document sends", () => {
    expect(() => assert({ host: "app.example.com", origin: "null" })).toThrow("This request was not permitted.");
  });

  test("refuses another site", () => {
    expect(() => assert({ host: "app.example.com", origin: "https://evil.example" })).toThrow(
      "This request was not permitted.",
    );
  });

  test("allows the host the request arrived on", () => {
    expect(() => assert({ host: "app.example.com", origin: "http://app.example.com" })).not.toThrow();
  });

  test("allows an https caller behind a proxy that reports no scheme", () => {
    expect(() => assert({ "x-forwarded-host": "app.example.com", origin: "https://app.example.com" })).not.toThrow();
  });

  test("compares the port, which a browser sets from the URL it opened", () => {
    expect(() => assert({ host: "localhost:8282", origin: "http://localhost:8282" })).not.toThrow();
    expect(() => assert({ host: "localhost:8282", origin: "http://localhost:3000" })).toThrow(
      "This request was not permitted.",
    );
  });

  test("reads an explicit default port in a forwarded host as the port Origin omits", () => {
    expect(() =>
      assert({ "x-forwarded-host": "app.example.com:443", origin: "https://app.example.com" }),
    ).not.toThrow();
  });

  test("allows the native shells", () => {
    expect(() => assert({ host: "app.example.com", origin: "app://localhost" })).not.toThrow();
    expect(() => assert({ host: "app.example.com", origin: "https://app.localhost" })).not.toThrow();
  });

  test("refuses the retired Capacitor shell origins", () => {
    for (const origin of ["capacitor://localhost", "ionic://localhost", "http://localhost"])
      expect(() => assert({ host: "app.example.com", origin })).toThrow("This request was not permitted.");
  });

  test("allows a configured origin and nothing else", () => {
    CrossSiteGuard.configure({ allowedOrigins: ["https://admin.example.com"] });
    expect(() => assert({ host: "app.example.com", origin: "https://admin.example.com" })).not.toThrow();
    expect(() => assert({ host: "app.example.com", origin: "https://other.example.com" })).toThrow(
      "This request was not permitted.",
    );
  });

  test("answers a native shell's preflight with its own origin and the path's verbs", () => {
    const req = new Request("http://akan-child/api/signinAdmin", {
      method: "OPTIONS",
      headers: { origin: "app://localhost", "access-control-request-headers": "authorization, content-type" },
    });
    const res = CrossSiteGuard.preflight(req, ["POST"]);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("app://localhost");
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("authorization, content-type");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("refuses a preflight from an origin outside the allowlist", () => {
    for (const origin of [undefined, "https://evil.example", "null"]) {
      const req = new Request("http://akan-child/api/signinAdmin", {
        method: "OPTIONS",
        headers: origin ? { origin } : {},
      });
      const res = CrossSiteGuard.preflight(req, ["POST"]);
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  test("labels an answer for an allowed origin, keeps its Vary, and never grants credentials", () => {
    const req = new Request("http://akan-child/api/me", { headers: { origin: "https://app.localhost" } });
    const res = CrossSiteGuard.withCors(req, new Response("{}", { headers: { vary: "Accept-Encoding" } }));
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.localhost");
    expect(res.headers.get("vary")).toBe("Accept-Encoding, origin");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("leaves an answer for another origin unlabelled", () => {
    const req = new Request("http://akan-child/api/me", { headers: { origin: "https://evil.example" } });
    expect(CrossSiteGuard.withCors(req, new Response("{}")).headers.get("access-control-allow-origin")).toBeNull();
  });

  test("labels a configured origin too", () => {
    CrossSiteGuard.configure({ allowedOrigins: ["https://admin.example.com"] });
    const req = new Request("http://akan-child/api/me", { headers: { origin: "https://admin.example.com" } });
    expect(CrossSiteGuard.withCors(req, new Response("{}")).headers.get("access-control-allow-origin")).toBe(
      "https://admin.example.com",
    );
  });

  test("passes everything through when disabled", () => {
    CrossSiteGuard.configure({ enabled: false });
    expect(() => assert({ host: "app.example.com", origin: "https://evil.example" })).not.toThrow();
  });
});
