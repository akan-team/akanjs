import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError, type ResolvedAcl } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import manifest from "../native-plugin.json";
import { canonicalUrl, normalizeUrl, prepare, redirected } from "../src/common.ts";
import { createDesktopHttp } from "../src/desktop.ts";
import { http, fetch as nativeFetch } from "../src/index.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code;
  }
};

// Two local servers: different ports are different origins.
type Server = ReturnType<typeof Bun.serve>;
let a: Server;
let b: Server;
let A = "";
let B = "";

function serve(): Server {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      if (path === "/echo") {
        const body = new Uint8Array(await req.arrayBuffer());
        const headers: Record<string, string> = {};
        for (const [k, v] of req.headers) headers[k] = v;
        return Response.json({
          method: req.method,
          headers,
          body: Buffer.from(body).toString("base64"),
          query: url.search,
        });
      }
      if (path === "/json") return Response.json({ ok: true, n: 1 });
      if (path === "/bom") return new Response(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69, 0xff]));
      if (path === "/bytes")
        return new Response(new Uint8Array([0, 1, 2, 253, 254, 255]), {
          headers: { "content-type": "application/octet-stream" },
        });
      if (path === "/gzip")
        return new Response(gzipSync("zipped text"), {
          headers: { "content-encoding": "gzip", "content-type": "text/plain" },
        });
      if (path === "/cookies") {
        const headers = new Headers();
        headers.append("set-cookie", "a=1; Path=/");
        headers.append("set-cookie", "b=2; Path=/");
        headers.append("x-multi", "1");
        headers.append("x-multi", "2");
        return new Response("", { headers });
      }
      if (path === "/missing") return new Response("nope", { status: 404 });
      if (path === "/empty") return new Response(null, { status: 204 });
      if (path === "/slow") {
        await Bun.sleep(1000);
        return new Response("late");
      }
      if (path === "/redirect") {
        const to = url.searchParams.get("to") ?? "/echo";
        return new Response(null, { status: Number(url.searchParams.get("status") ?? 302), headers: { location: to } });
      }
      if (path === "/loop")
        return new Response(null, {
          status: 302,
          headers: { location: `/loop?n=${Number(url.searchParams.get("n") ?? 0) + 1}` },
        });
      return new Response("root");
    },
  });
}

beforeAll(() => {
  a = serve();
  b = serve();
  A = `http://127.0.0.1:${a.port}`;
  B = `http://127.0.0.1:${b.port}`;
});
afterAll(() => {
  a.stop(true);
  b.stop(true);
});

describe("http URLs", () => {
  test("canonical form: the one the scope matches and the hosts send", async () => {
    // The same cases run against HttpUrl.swift and HttpUrl.kt (scripts/native-vectors.ts).
    const { cases } = (await Bun.file(new URL("./vectors/canonical.json", import.meta.url)).json()) as {
      cases: [string, string | null][];
    };
    for (const [input, output] of cases) expect([input, canonicalUrl(input)]).toEqual([input, output]);
    // idempotent, and WHATWG output is always acceptable
    for (const raw of [
      "https://한글.kr/경로?q=값#f",
      "http://x/a/./b/../c",
      "https://x/a/%2e%2E/b",
      "https://x/{a}?b=\\",
      "HTTP://X:0080",
    ]) {
      const once = normalizeUrl(raw);
      expect(canonicalUrl(once)).toBe(once);
    }
    expect(normalizeUrl("http://x/a/./b/../c")).toBe("http://x/a/c");
    expect(normalizeUrl("https://한글.kr/경로")).toBe("https://xn--bj0bj06e.kr/%EA%B2%BD%EB%A1%9C");
    for (const bad of ["", "example.com", "/relative", "file:///etc/hosts", "data:text/plain,x", "https://u:p@x/", 7]) {
      expect(codeOf(() => normalizeUrl(bad))).toBe("INVALID_ARGS");
    }
  });

  test("request checks", () => {
    const ok = prepare({
      url: "https://x/",
      method: "POST",
      headers: { "X-A": " 1 ", Authorization: "t" },
      body: "hi",
    });
    expect(ok.headers).toEqual([
      ["X-A", "1"],
      ["Authorization", "t"],
      ["Content-Type", "text/plain;charset=UTF-8"],
    ]);
    expect(prepare({ url: "https://x/", method: "PUT", body: "AAE=", bodyEncoding: "base64" }).headers).toEqual([
      ["Content-Type", "application/octet-stream"],
    ]);
    expect(
      prepare({ url: "https://x/", method: "POST", body: "{}", headers: { "content-type": "application/json" } })
        .headers,
    ).toEqual([["content-type", "application/json"]]);
    expect(prepare({ url: "https://x/" })).toMatchObject({
      method: "GET",
      responseType: "text",
      timeout: 60000,
      body: null,
    });
    const bad: unknown[] = [
      null,
      { url: "https://x/a/../b" },
      { url: "https://x/", method: "get" },
      { url: "https://x/", method: "TRACE" },
      { url: "https://x/", body: "x" },
      { url: "https://x/", method: "HEAD", body: "" },
      { url: "https://x/", headers: { Host: "y" } },
      { url: "https://x/", headers: { "Accept-Encoding": "gzip" } },
      { url: "https://x/", headers: { "Content-Length": "1" } },
      { url: "https://x/", headers: { "bad name": "1" } },
      { url: "https://x/", headers: { "X-A": "1\r\nX-B: 2" } },
      { url: "https://x/", headers: { "X-A": 1 } },
      { url: "https://x/", headers: { "X-A": "1", "x-a": "2" } },
      { url: "https://x/", method: "POST", body: "@@", bodyEncoding: "base64" },
      { url: "https://x/", method: "POST", body: "x", bodyEncoding: "latin1" },
      { url: "https://x/", responseType: "json" },
      { url: "https://x/", timeout: 0 },
      { url: "https://x/", timeout: 2 ** 31 },
    ];
    for (const args of bad) expect([args, codeOf(() => prepare(args))]).toEqual([args, "INVALID_ARGS"]);
  });

  test("redirect rewrites follow fetch", () => {
    const base = {
      method: "POST" as const,
      headers: [
        ["Content-Type", "text/plain"],
        ["Authorization", "t"],
        ["X", "1"],
      ] as [string, string][],
      body: new Uint8Array([1]),
    };
    expect(redirected(302, base, "https://a/x", "https://a/y")).toEqual({
      method: "GET",
      headers: [
        ["Authorization", "t"],
        ["X", "1"],
      ],
      body: null,
    });
    expect(redirected(307, base, "https://a/x", "https://a/y")).toEqual(base);
    expect(redirected(308, base, "https://a/x", "https://b/y")).toEqual({
      ...base,
      headers: [
        ["Content-Type", "text/plain"],
        ["X", "1"],
      ],
    });
    expect(redirected(303, { ...base, method: "PUT" }, "https://a/x", "https://a:8443/y").method).toBe("GET");
    expect(redirected(303, { ...base, method: "HEAD", body: null }, "https://a/x", "https://a/y").method).toBe("HEAD");
    expect(redirected(301, { ...base, method: "PUT" }, "https://a/x", "https://a/y").method).toBe("PUT");
  });
});

describe("http routing", () => {
  test("the page sends the canonical URL and parses JSON itself", async () => {
    host = installMockHost({
      platform: "ios",
      plugins: {
        http: {
          methods: {
            request: (args) => ({
              status: 200,
              headers: { "content-type": "application/json" },
              data: args.url.endsWith("/empty") ? "" : '{"a":[1,2]}',
              url: args.url,
            }),
          },
        },
      },
    });
    const res = await http.request({
      url: "HTTPS://API.Example.com:443/v1/../items?q=1#top",
      method: "get" as never,
      responseType: "json",
    });
    expect(res).toEqual({
      status: 200,
      headers: { "content-type": "application/json" },
      data: { a: [1, 2] },
      url: "https://api.example.com/items?q=1",
    });
    expect(host.requests[0]!.args).toEqual({ url: "https://api.example.com/items?q=1", method: "GET" });
    expect((await http.request({ url: "https://x/empty", responseType: "json" })).data).toBeNull();
    await http.request({ url: "https://x/", responseType: "base64" });
    expect(host.requests.at(-1)!.args).toEqual({ url: "https://x/", responseType: "base64" });
    expect(isAkanNativeError(await http.request({ url: "file:///etc/hosts" }).catch((e) => e), "INVALID_ARGS")).toBe(
      true,
    );
    expect(
      isAkanNativeError(
        await http.request({ url: "https://x/", responseType: "blob" as never }).catch((e) => e),
        "INVALID_ARGS",
      ),
    ).toBe(true);
    expect(host.requests.length).toBe(3); // the rejected calls never reached the host
  });

  test("invalid JSON rejects INTERNAL", async () => {
    host = installMockHost({
      platform: "android",
      plugins: {
        http: { methods: { request: (args) => ({ status: 502, headers: {}, data: "<html>", url: args.url }) } },
      },
    });
    const error = await http.request({ url: "https://x/", responseType: "json" }).catch((e) => e);
    expect(isAkanNativeError(error, "INTERNAL")).toBe(true);
    expect(error.message).toContain("502");
  });

  test("fetch() builds a Response from the native result", async () => {
    host = installMockHost({
      platform: "android",
      plugins: {
        http: {
          methods: {
            request: (args) =>
              args.url.endsWith("/none")
                ? { status: 204, headers: {}, data: "", url: args.url }
                : {
                    status: 201,
                    headers: { "content-type": "application/json", "x-a": "1" },
                    data: btoa('{"made":true}'),
                    url: "https://x/final",
                  },
          },
        },
      },
    });
    const res = await nativeFetch("https://x/items", {
      method: "post",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
      timeout: 5000,
    });
    expect(res.status).toBe(201);
    expect(res.url).toBe("https://x/final");
    expect(res.headers.get("x-a")).toBe("1");
    expect(await res.json()).toEqual({ made: true });
    expect(host.requests[0]!.args).toEqual({
      url: "https://x/items",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
      timeout: 5000,
      responseType: "base64",
    });
    await nativeFetch("https://x/bin", { method: "PUT", body: new Uint8Array([0, 255]) });
    expect(host.requests[1]!.args).toMatchObject({ method: "PUT", body: "AP8=", bodyEncoding: "base64" });
    await nativeFetch("https://x/form", { method: "POST", body: new URLSearchParams({ a: "1 2" }) });
    expect(host.requests[2]!.args).toMatchObject({
      body: "a=1+2",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    });
    expect((await nativeFetch("https://x/none")).status).toBe(204);
  });

  test("manifest: every platform implements request", () => {
    const plugin = { spec: "http", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["ios", "android", "macos"] as const)
      expect(pluginDecls([plugin], platform)).toEqual({ http: { methods: ["request"], events: [] } });
  });
});

describe("http web implementation (the page's fetch)", () => {
  test("requests with the browser's fetch; the scope applies to the first and the final URL", async () => {
    const acl: ResolvedAcl = { grants: [{ plugin: "http", windows: "*", items: "*", allow: [{ url: `${A}/*` }] }] };
    host = installMockHost({ platform: "web", acl });
    expect(http.implementation("request")).toBe("web");
    const res = await http.request({ url: `${A}/echo?x=1`, method: "POST", body: "hé" });
    expect(res.status).toBe(200);
    const echo = JSON.parse(res.data);
    expect(echo).toMatchObject({ method: "POST", body: Buffer.from("hé").toString("base64"), query: "?x=1" });
    expect(echo.headers["content-type"]).toBe("text/plain;charset=UTF-8");
    expect(isAkanNativeError(await http.request({ url: `${B}/echo` }).catch((e) => e), "NOT_ALLOWED")).toBe(true);
    const redirected = await http
      .request({ url: `${A}/redirect?to=${encodeURIComponent(`${B}/echo`)}` })
      .catch((e) => e);
    expect(isAkanNativeError(redirected, "NOT_ALLOWED")).toBe(true);
  });
});

describe("http desktop implementation", () => {
  function harness(acl?: ResolvedAcl, send?: typeof fetch) {
    const dispatcher = createDispatcher(
      [createDesktopHttp(send)],
      {
        app: { id: "dev.test", name: "Test", version: "1.0.0", build: 1 },
        appDataDir: "/tmp/akan-native-http-test",
        emit: () => {},
        registerFile: () => ({ url: "", mime: "", size: 0 }),
      },
      { acl },
    );
    let id = 0;
    const call = async (args: unknown) => {
      const res = await dispatcher.handle(JSON.stringify({ v: 1, id: ++id, plugin: "http", method: "request", args }));
      if (res.ok) return res.result as { status: number; headers: Record<string, string>; data: string; url: string };
      throw Object.assign(new Error(res.error.message), { code: res.error.code });
    };
    const fails = (args: unknown) =>
      call(args).then(
        () => "resolved",
        (e) => `${e.code}: ${e.message}`,
      );
    return { call, fails };
  }
  const echoOf = (res: { data: string }) =>
    JSON.parse(res.data) as { method: string; headers: Record<string, string>; body: string; query: string };

  test("methods, headers and bodies", async () => {
    const { call } = harness();
    const get = await call({ url: `${A}/echo?q=1`, headers: { "X-Test": "yes", "User-Agent": "akan-native-test" } });
    expect(get.status).toBe(200);
    expect(get.url).toBe(`${A}/echo?q=1`);
    expect(get.headers["content-type"]).toStartWith("application/json");
    expect(echoOf(get)).toMatchObject({ method: "GET", body: "", query: "?q=1" });
    expect(echoOf(get).headers).toMatchObject({ "x-test": "yes", "user-agent": "akan-native-test" });
    const post = echoOf(
      await call({
        url: `${A}/echo`,
        method: "POST",
        body: '{"a":"한"}',
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(post).toMatchObject({ method: "POST", body: Buffer.from('{"a":"한"}').toString("base64") });
    expect(post.headers["content-type"]).toBe("application/json");
    const bytes = echoOf(await call({ url: `${A}/echo`, method: "PATCH", body: "AAEC/f7/", bodyEncoding: "base64" }));
    expect(bytes).toMatchObject({ method: "PATCH", body: "AAEC/f7/" });
    expect(bytes.headers["content-type"]).toBe("application/octet-stream");
    const empty = echoOf(await call({ url: `${A}/echo`, method: "POST" }));
    expect(empty.headers["content-length"]).toBe("0");
    for (const method of ["PUT", "DELETE", "OPTIONS"])
      expect(echoOf(await call({ url: `${A}/echo`, method })).method).toBe(method);
    const head = await call({ url: `${A}/json`, method: "HEAD" });
    expect([head.status, head.data]).toEqual([200, ""]);
  });

  test("responses: status, binary, BOM, gzip, repeated headers", async () => {
    const { call } = harness();
    expect(await call({ url: `${A}/missing` })).toMatchObject({ status: 404, data: "nope" });
    expect(await call({ url: `${A}/empty` })).toMatchObject({ status: 204, data: "" });
    expect((await call({ url: `${A}/bytes`, responseType: "base64" })).data).toBe("AAEC/f7/");
    expect((await call({ url: `${A}/bom` })).data).toBe("hi�");
    const zipped = await call({ url: `${A}/gzip` });
    expect(zipped.data).toBe("zipped text");
    expect(zipped.headers["content-encoding"]).toBeUndefined();
    expect(zipped.headers["content-length"]).toBeUndefined();
    const cookies = await call({ url: `${A}/cookies` });
    expect(cookies.headers["set-cookie"]).toBe("a=1; Path=/, b=2; Path=/");
    expect(cookies.headers["x-multi"]).toBe("1, 2");
  });

  test("redirects: fetch's method rules, credentials stay on their origin, loops end", async () => {
    const { call, fails } = harness();
    const see = await call({ url: `${A}/redirect?status=303&to=/echo`, method: "POST", body: "x" });
    expect([see.url, echoOf(see).method, echoOf(see).body]).toEqual([`${A}/echo`, "GET", ""]);
    const keep = echoOf(
      await call({
        url: `${A}/redirect?status=307&to=/echo`,
        method: "POST",
        body: "x",
        headers: { Authorization: "secret" },
      }),
    );
    expect([keep.method, keep.body, keep.headers.authorization]).toEqual(["POST", "eA==", "secret"]);
    const away = echoOf(
      await call({
        url: `${A}/redirect?status=308&to=${encodeURIComponent(`${B}/echo`)}`,
        method: "PUT",
        body: "x",
        headers: { Authorization: "secret", Cookie: "c=1", "X-Keep": "1" },
      }),
    );
    expect([away.method, away.body, away.headers.authorization, away.headers.cookie, away.headers["x-keep"]]).toEqual([
      "PUT",
      "eA==",
      undefined,
      undefined,
      "1",
    ]);
    expect(await fails({ url: `${A}/loop` })).toBe(`INTERNAL: ${A}/loop redirected more than 20 times`);
    expect(await fails({ url: `${A}/redirect?to=${encodeURIComponent("ftp://x/")}` })).toStartWith(
      `INTERNAL: cannot follow the redirect from ${A}/redirect`,
    );
  });

  test("capabilities scope (PL-11): the first URL and every redirect", async () => {
    const acl: ResolvedAcl = {
      grants: [
        { plugin: "http", windows: "*", items: "*", allow: [{ url: `${A}/*` }], deny: [{ url: `${A}/missing*` }] },
      ],
    };
    const { call, fails } = harness(acl);
    expect((await call({ url: `${A}/json` })).status).toBe(200);
    expect(await fails({ url: `${B}/json` })).toBe(
      `NOT_ALLOWED: request to ${B}/json is outside the app's capabilities`,
    );
    expect(await fails({ url: `${A}/missing` })).toStartWith("NOT_ALLOWED");
    expect(await fails({ url: `${A}/redirect?to=${encodeURIComponent(`${B}/echo`)}` })).toBe(
      `NOT_ALLOWED: redirect to ${B}/echo is outside the app's capabilities`,
    );
    expect((await call({ url: `${A}/redirect?to=/json` })).url).toBe(`${A}/json`);
  });

  test("failures: timeout, refused connection, bad arguments", async () => {
    const { fails } = harness();
    const started = performance.now();
    expect(await fails({ url: `${A}/slow`, timeout: 150 })).toBe(
      `INTERNAL: request to ${A}/slow timed out after 150 ms`,
    );
    expect(performance.now() - started).toBeLessThan(900);
    expect(await fails({ url: "http://127.0.0.1:1/" })).toStartWith("INTERNAL: request to http://127.0.0.1:1/ failed");
    expect(await fails({ url: `${A}/`, body: "x" })).toBe("INVALID_ARGS: a GET request cannot have a body");
    expect(await fails({ url: `${A}/../x` })).toStartWith("INVALID_ARGS");
  });
});
