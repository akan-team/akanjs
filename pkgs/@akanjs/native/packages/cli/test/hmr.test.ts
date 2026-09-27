import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cspHash, inlineBlocks, parseCsp } from "../src/lib/csp.ts";
import {
  bunDevServerScript,
  devCspSources,
  devShim,
  resolveDevEntry,
  rewriteDevHtml,
  routeDevRequest,
  startHmrServer,
} from "../src/lib/hmr.ts";
import type { Project } from "../src/lib/project.ts";

// What Bun 1.4's dev server sends for `routes: { "/": page }` (the entry's module script is replaced).
const BUN_PAGE =
  `<!doctype html><html><head><meta charset="utf-8"><title>t</title>` +
  `<script type="module" crossorigin src="/_bun/client/index-000000003924dc8b.js" data-bun-dev-server-script></script>` +
  `<script>((a)=>{document.addEventListener('visibilitychange',globalThis[Symbol.for('bun:loadData')]=()=>document.visibilityState==='hidden'&&navigator.sendBeacon('/_bun/unref',a));})(document.querySelector('[data-bun-dev-server-script]').src.slice(-11,-3))</script>` +
  `</head><body><div id="root"></div></body></html>`;

const temps: string[] = [];
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function fakeProject(appDir: string, web: Record<string, string> = {}, csp?: unknown): Project {
  return {
    appDir,
    configPath: join(appDir, "akan-native.config.ts"),
    plugins: [],
    config: { web: { dir: "dist", base: "/", ...web }, security: { csp } },
  } as unknown as Project;
}

/** Runs the shim against a recording WebSocket, as a page on `href` would. */
function withShim(port: number, href: string) {
  const opened: { url: string; protocols?: unknown }[] = [];
  class FakeSocket {
    constructor(url: string, protocols?: unknown) {
      opened.push(protocols === undefined ? { url } : { url, protocols });
    }
  }
  const window: { WebSocket: unknown } = { WebSocket: FakeSocket };
  new Function("window", "location", "URL", "Element", devShim({ origin: `ws://localhost:${port}` }))(
    window,
    new URL(href),
    URL,
    class {},
  );
  const Socket = window.WebSocket as new (url: string, protocols?: unknown) => object;
  return { Socket, FakeSocket, opened };
}

describe("dev WebSocket shim", () => {
  test("the app's own socket paths (W4) go to the gateway too, only on the page's origin", () => {
    const opened: string[] = [];
    const window: { WebSocket: unknown } = {
      WebSocket: class {
        constructor(url: string) {
          opened.push(url);
        }
      },
    };
    new Function(
      "window",
      "location",
      "URL",
      "Element",
      devShim({ origin: "ws://192.168.0.5:4321", path: "/_akan/hmr", paths: ["/ws"] }),
    )(window, new URL("app://localhost/en/"), URL, class {});
    const Socket = window.WebSocket as new (url: string) => object;
    for (const url of ["/ws?token=1", "app://localhost/_akan/hmr", "/wss", "ws://localhost:8080/ws"]) new Socket(url);
    expect(opened).toEqual([
      "ws://192.168.0.5:4321/ws?token=1",
      "ws://192.168.0.5:4321/_akan/hmr",
      "/wss",
      "ws://localhost:8080/ws",
    ]);
  });

  test("app://localhost: Bun's /_bun/hmr socket goes to the gateway, others are untouched", () => {
    const { Socket, FakeSocket, opened } = withShim(4321, "app://localhost/settings");
    const socket = new Socket("app://localhost/_bun/hmr");
    new Socket("/_bun/hmr", ["x"]);
    new Socket("ws://localhost:9999/other");
    new Socket("wss://example.com/_bun/hmr");
    expect(opened).toEqual([
      { url: "ws://localhost:4321/_bun/hmr" },
      { url: "ws://localhost:4321/_bun/hmr", protocols: ["x"] },
      { url: "ws://localhost:9999/other" },
      { url: "wss://example.com/_bun/hmr" },
    ]);
    expect(socket).toBeInstanceOf(FakeSocket);
    expect(socket instanceof (Socket as unknown as typeof FakeSocket)).toBe(true);
    expect((Socket as unknown as { OPEN: number; CLOSED: number }).OPEN).toBe(1);
  });

  test("Android https://app.localhost: wss://app.localhost/_bun/hmr is redirected too", () => {
    const { Socket, opened } = withShim(5000, "https://app.localhost/");
    new Socket("wss://app.localhost/_bun/hmr");
    expect(opened).toEqual([{ url: "ws://localhost:5000/_bun/hmr" }]);
  });
});

describe("dev request relay (Android)", () => {
  //? A page on https://app.localhost, with a recording fetch and XMLHttpRequest in place of the WebView's.
  const pageWithRelay = (relayBodies: boolean) => {
    const sent: string[] = [];
    class Request {
      constructor(
        readonly url: string,
        readonly init?: { method?: string } | Request,
      ) {}
      get method(): string {
        return this.init instanceof Request ? this.init.method : (this.init?.method ?? "GET");
      }
    }
    class XMLHttpRequest {
      open(method: string, url: string) {
        sent.push(`xhr ${method} ${url}`);
      }
    }
    const window: Record<string, unknown> = {
      WebSocket: class {},
      Request,
      XMLHttpRequest,
      fetch: (input: string | Request, init?: { method?: string }) => {
        const url = typeof input === "string" ? input : input.url;
        const method = init?.method ?? (typeof input === "string" ? "GET" : input.method);
        sent.push(`fetch ${method} ${url}`);
      },
    };
    new Function("window", "location", "URL", "Element", devShim({ origin: "ws://localhost:5000", relayBodies }))(
      window,
      new URL("https://app.localhost/en/"),
      URL,
      class {},
    );
    return { window, sent, Request, XMLHttpRequest };
  };

  test("a call with a body leaves for the gateway; GET, other origins and the host's paths stay", () => {
    const { window, sent, Request, XMLHttpRequest } = pageWithRelay(true);
    const fetch = window.fetch as (input: unknown, init?: { method?: string }) => void;
    fetch("/api/createUser", { method: "post" });
    fetch(new Request("https://app.localhost/api/removeUser?x=1", { method: "DELETE" }));
    fetch("/api/getSelf");
    fetch("https://example.com/api/x", { method: "POST" });
    fetch("/__akan_native/ipc", { method: "POST" });
    new XMLHttpRequest().open("PUT", "/api/upload");
    new XMLHttpRequest().open("GET", "/api/list");

    expect(sent).toEqual([
      "fetch post http://localhost:5000/api/createUser",
      "fetch DELETE http://localhost:5000/api/removeUser?x=1",
      "fetch GET /api/getSelf",
      "fetch POST https://example.com/api/x",
      "fetch POST /__akan_native/ipc",
      "xhr PUT http://localhost:5000/api/upload",
      "xhr GET /api/list",
    ]);
    expect(window.__AKAN_NATIVE_DEV__).toEqual({ gateway: "http://localhost:5000" });
  });

  test("iOS carries every call itself: nothing is rewritten, the page is only marked", () => {
    const { window, sent } = pageWithRelay(false);
    (window.fetch as (input: string, init: { method: string }) => void)("/api/createUser", { method: "POST" });
    expect(sent).toEqual(["fetch POST /api/createUser"]);
    expect(window.__AKAN_NATIVE_DEV__).toEqual({ gateway: "http://localhost:5000" });
  });
});

describe("dev overlay style", () => {
  test("Bun's overlay host gets its style through CSSOM (allowed by style-src-attr), other elements unchanged", () => {
    const calls: string[] = [];
    class Element {
      localName: string;
      style = { cssText: "" };
      constructor(name: string) {
        this.localName = name;
      }
      setAttribute(name: string, value: string) {
        calls.push(`${this.localName} ${name}=${value}`);
      }
    }
    new Function("window", "location", "URL", "Element", devShim())(
      {},
      new URL("http://localhost:4173/"),
      URL,
      Element,
    );
    const overlay = new Element("bun-hmr");
    overlay.setAttribute("style", "position:fixed!important");
    overlay.setAttribute("class", "x");
    new Element("div").setAttribute("style", "color:red");
    expect(overlay.style.cssText).toBe("position:fixed!important");
    expect(calls).toEqual(["bun-hmr class=x", "div style=color:red"]);
  });
});

describe("dev CSP additions", () => {
  test("blob: scripts and the gateway socket on top of the app's policy", () => {
    const map = parseCsp(
      devCspSources(
        "default-src 'self'; script-src 'self' 'sha256-x'; connect-src 'self' blob:",
        "ws://localhost:4321",
      ),
    );
    expect(map.get("script-src")).toEqual(["'self'", "'sha256-x'", "blob:"]);
    expect(map.get("connect-src")).toEqual([
      "'self'",
      "blob:",
      "ws://localhost:4321",
      "ws://127.0.0.1:4321",
      "http://localhost:4321",
      "http://127.0.0.1:4321",
    ]);
    expect(map.get("default-src")).toEqual(["'self'"]);
  });

  test("a missing directive starts from default-src ('none' dropped); without default-src it stays unrestricted", () => {
    const map = parseCsp(devCspSources("default-src 'none'; script-src-elem 'self'", "ws://localhost:1"));
    expect(map.get("script-src")).toEqual(["blob:"]);
    expect(map.get("script-src-elem")).toEqual(["'self'", "blob:"]);
    expect(map.get("connect-src")).toEqual([
      "ws://localhost:1",
      "ws://127.0.0.1:1",
      "http://localhost:1",
      "http://127.0.0.1:1",
    ]);
    expect(devCspSources("img-src 'self'", "ws://localhost:1")).toBe("img-src 'self'");
  });
});

describe("dev page rewrite", () => {
  test("native: init.js first, the shim before Bun's client, a policy over the final page", () => {
    const { html, warnings } = rewriteDevHtml(BUN_PAGE, { platform: "ios", port: 4321, csp: "strict" });
    expect(warnings).toEqual([]);
    expect(html).toStartWith(
      `<!doctype html><html><head><script src="/__akan_native/init.js"></script><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"`,
    );
    const shim = `<script>${devShim({ origin: "ws://localhost:4321" })}</script>`;
    expect(html.indexOf(shim)).toBeGreaterThan(0);
    expect(html.indexOf(shim)).toBeLessThan(html.indexOf("data-bun-dev-server-script"));
    const policy = parseCsp(
      /content="([^"]*)"/
        .exec(html)![1]!
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    );
    const scripts = policy.get("script-src")!;
    // Every inline script of the final page (the shim and Bun's own) is hashed.
    for (const script of inlineBlocks(html).scripts) expect(scripts).toContain(cspHash(script));
    expect(inlineBlocks(html).scripts).toHaveLength(2);
    expect(scripts).toContain("blob:");
    expect(policy.get("connect-src")).toContain("ws://localhost:4321");
    expect(policy.get("object-src")).toEqual(["'none'"]);
  });

  test("web: no socket redirect (Bun's client already talks to the page's own host), no policy unless configured", () => {
    const { html } = rewriteDevHtml(BUN_PAGE, { platform: "web", port: 4173 });
    expect(devShim()).not.toContain("WebSocket");
    expect(html).toBe(
      BUN_PAGE.replace("<head>", `<head><script src="/__akan_native/init.js"></script>`).replace(
        `<script type="module" crossorigin`,
        `<script>${devShim()}</script><script type="module" crossorigin`,
      ),
    );
  });

  test("warns when the entry brings its own policy and security.csp is unset", () => {
    const own = BUN_PAGE.replace(
      "<title>",
      `<meta http-equiv="Content-Security-Policy" content="default-src 'self'"><title>`,
    );
    expect(rewriteDevHtml(own, { platform: "macos", port: 1 }).warnings[0]).toContain("script-src blob:");
    expect(() => rewriteDevHtml(own, { platform: "macos", port: 1, csp: "strict" })).toThrow(
      "already has a Content-Security-Policy",
    );
  });

  test("a page without Bun's script tag still gets the shim in <head>", () => {
    const { html } = rewriteDevHtml("<html><head><title>t</title></head><body></body></html>", {
      platform: "android",
      port: 2,
    });
    expect(html).toBe(
      `<html><head><script src="/__akan_native/init.js"></script><title>t</title><script>${devShim({ origin: "ws://localhost:2", relayBodies: true })}</script></head><body></body></html>`,
    );
  });
});

describe("dev gateway routes", () => {
  const app = tempDir("akan-native-hmr-routes-");
  mkdirSync(join(app, "public", "img"), { recursive: true });
  mkdirSync(join(app, "dist"), { recursive: true });
  writeFileSync(join(app, "public", "img", "a.png"), "png");
  writeFileSync(join(app, "public", "shared.txt"), "public wins");
  writeFileSync(join(app, "dist", "shared.txt"), "stale build");
  writeFileSync(join(app, "dist", "index.html"), "<html>built</html>");
  writeFileSync(join(app, "dist", "only-built.js"), "x");
  const dirs = [join(app, "public"), join(app, "dist")];

  test.each([
    ["/_bun/hmr", { kind: "hmr" }],
    ["/_bun/client/index-1.js", { kind: "bun" }],
    ["/_bun/asset/0123456789abcdef.css", { kind: "bun" }],
    ["/__akan_native/init.js", { kind: "init" }],
    ["/__akan_native/ipc", { kind: "not-found" }],
    ["/__akan_native/file/abc.png", { kind: "not-found" }],
    ["/", { kind: "page" }],
    ["/index.html", { kind: "page" }],
    ["/settings/deep", { kind: "page" }],
    ["/missing.png", { kind: "not-found" }],
    ["/%2e%2e/secret", { kind: "not-found" }],
  ] as const)("%s", (path, expected) => {
    expect(routeDevRequest(path, dirs)).toEqual(expected);
  });

  test("public files: public/ first, then web.dir; never the built index.html", () => {
    expect(routeDevRequest("/img/a.png", dirs)).toEqual({ kind: "file", path: join(app, "public", "img", "a.png") });
    expect(routeDevRequest("/shared.txt", dirs)).toEqual({ kind: "file", path: join(app, "public", "shared.txt") });
    expect(routeDevRequest("/only-built.js", dirs)).toEqual({ kind: "file", path: join(app, "dist", "only-built.js") });
  });
});

describe("dev entry", () => {
  test("index.html in the app folder by default, web.devEntry when set, a clear error otherwise", () => {
    const app = tempDir("akan-native-hmr-entry-");
    expect(() => resolveDevEntry(fakeProject(app))).toThrow("Set web.devEntry in akan-native.config.ts");
    writeFileSync(join(app, "index.html"), "<html></html>");
    expect(resolveDevEntry(fakeProject(app))).toBe(join(app, "index.html"));
    expect(() => resolveDevEntry(fakeProject(app, { devEntry: "src/app.html" }))).toThrow(
      `web.devEntry: ${join(app, "src", "app.html")} not found`,
    );
    mkdirSync(join(app, "src"));
    writeFileSync(join(app, "src", "app.html"), "<html></html>");
    expect(resolveDevEntry(fakeProject(app, { devEntry: "src/app.html" }))).toBe(join(app, "src", "app.html"));
  });

  test("the child's script imports the entry and reports its port", () => {
    const script = bunDevServerScript("/a/b/index.html");
    expect(script).toContain(`import page from "/a/b/index.html";`);
    expect(script).toContain(`routes: { "/": page }`);
    expect(script).toContain("hmr: true");
    expect(script).toContain(`"AKAN_NATIVE_DEV_SERVER " + server.port`);
  });
});

describe("dev gateway with Bun's dev server", () => {
  test("serves the rewritten page, proxies /_bun/* and the HMR socket", async () => {
    const app = tempDir("akan-native-hmr-gw-");
    mkdirSync(join(app, "public"));
    writeFileSync(join(app, "public", "hello.txt"), "hello");
    writeFileSync(
      join(app, "index.html"),
      `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><script type="module" src="./main.ts"></script></body></html>`,
    );
    writeFileSync(join(app, "main.ts"), `document.title = "main";\n`);
    const project = fakeProject(app, {}, "strict");
    const warnings: string[] = [];
    const server = await startHmrServer({
      platform: "ios",
      entry: join(app, "index.html"),
      port: 0,
      hostname: "127.0.0.1",
      context: { project },
      onLine: () => {},
      onWarning: (text) => warnings.push(text),
    });
    try {
      const page = await fetch(`${server.url}/some/route`);
      expect(page.headers.get("content-type")).toContain("text/html");
      const html = await page.text();
      expect(html).toContain(`<script src="/__akan_native/init.js"></script>`);
      expect(html).toContain(devShim({ origin: `ws://localhost:${server.port}` }));
      expect(html).toContain(`ws://localhost:${server.port}`);
      const client = /src="(\/_bun\/client\/[^"]+)"/.exec(html)![1]!;
      const js = await fetch(server.url + client);
      expect(js.status).toBe(200);
      expect(js.headers.get("content-type")).toContain("javascript");
      expect(await js.text()).toContain(`document.title = "main"`);
      expect(await (await fetch(`${server.url}/hello.txt`)).text()).toBe("hello");
      expect((await fetch(`${server.url}/nope.png`)).status).toBe(404);
      // Native hosts serve /__akan_native/init.js themselves.
      expect((await fetch(`${server.url}/__akan_native/init.js`)).status).toBe(404);

      const socket = new WebSocket(`ws://127.0.0.1:${server.port}/_bun/hmr`);
      socket.binaryType = "arraybuffer";
      const first = await new Promise<unknown>((resolve, reject) => {
        socket.onmessage = (event) => resolve(event.data);
        socket.onerror = () => reject(new Error("socket error"));
        setTimeout(() => reject(new Error("no HMR message")), 5000);
      });
      expect(first).toBeDefined();
      socket.close();
      expect(warnings).toEqual([]);
    } finally {
      server.stop();
    }
  }, 30_000);
});

describe("dev gateway with an external dev server (akanjs readiness O4-1, O4-2)", () => {
  test("proxies every path, rewrites HTML answers, relays the app's HMR socket path, keeps redirects on the app origin", async () => {
    const upstreamServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req, srv) {
        const url = new URL(req.url);
        if (url.pathname === "/_akan/hmr")
          return srv.upgrade(req, { data: url.search }) ? undefined : new Response("no", { status: 400 });
        if (url.pathname === "/") return Response.redirect(`http://127.0.0.1:${srv.port}/en/`, 302);
        if (url.pathname === "/_akan/app.js")
          return new Response("console.log(1)", { headers: { "content-type": "text/javascript" } });
        if (url.searchParams.get("csr") === "true") {
          return new Response(
            `<!doctype html><html><head><script type="module">new WebSocket("/_akan/hmr")</script></head><body>${url.pathname}</body></html>`,
            {
              headers: { "content-type": "text/html" },
            },
          );
        }
        return new Response("not csr", { status: 404 });
      },
      websocket: {
        data: "" as string,
        message(ws, message) {
          ws.send(`echo ${message} ${ws.data}`);
        },
      },
    });
    const app = tempDir("akan-native-hmr-upstream-");
    const server = await startHmrServer({
      platform: "ios",
      upstream: `http://127.0.0.1:${upstreamServer.port}`,
      hmrPath: "/_akan/hmr",
      port: 0,
      hostname: "127.0.0.1",
      context: { project: fakeProject(app) },
      onLine: () => {},
      onWarning: () => {},
    });
    try {
      const page = await (await fetch(`${server.url}/en/explore?csr=true&akanMobileTarget=default`)).text();
      expect(page).toStartWith(`<!doctype html><html><head><script src="/__akan_native/init.js"></script><script>`);
      expect(page).toContain(devShim({ origin: `ws://localhost:${server.port}`, path: "/_akan/hmr" }));
      expect(page.indexOf("new WebSocket")).toBeGreaterThan(page.indexOf("window.WebSocket=S"));
      expect(page).toContain("<body>/en/explore</body>");
      expect(await (await fetch(`${server.url}/_akan/app.js`)).text()).toBe("console.log(1)");
      const redirect = await fetch(`${server.url}/`, { redirect: "manual" });
      expect([redirect.status, redirect.headers.get("location")]).toEqual([302, "/en/"]);
      expect((await fetch(`${server.url}/__akan_native/ipc`)).status).toBe(404);
      expect((await fetch(`${server.url}/nope`)).status).toBe(404);
      const reply = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${server.port}/_akan/hmr?token=1`);
        ws.onopen = () => ws.send("hi");
        ws.onmessage = (e) => (resolve(String(e.data)), ws.close());
        ws.onerror = () => reject(new Error("socket failed"));
      });
      expect(reply).toBe("echo hi ?token=1");
    } finally {
      server.stop();
      upstreamServer.stop(true);
    }
    expect(await server.exited).toBe(0);
  }, 30_000);

  test("wsPaths: the app's own socket reaches the dev server through the gateway; its HTTP fallback is proxied", async () => {
    const upstreamServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req, srv) {
        const url = new URL(req.url);
        if (url.pathname === "/ws" && req.headers.get("upgrade"))
          return srv.upgrade(req, { data: url.search }) ? undefined : new Response("no", { status: 400 });
        if (url.pathname === "/ws") return new Response("polling");
        return new Response("<!doctype html><html><head></head><body></body></html>", {
          headers: { "content-type": "text/html" },
        });
      },
      websocket: {
        data: "" as string,
        message(ws, message) {
          ws.send(`server ${message} ${ws.data}`);
        },
      },
    });
    const server = await startHmrServer({
      platform: "ios",
      upstream: `http://127.0.0.1:${upstreamServer.port}`,
      hmrPath: "/_akan/hmr",
      wsPaths: ["/ws"],
      port: 0,
      hostname: "127.0.0.1",
      context: { project: fakeProject(tempDir("akan-native-hmr-ws-")) },
      onLine: () => {},
      onWarning: () => {},
    });
    try {
      expect(await (await fetch(`${server.url}/en/`)).text()).toContain(JSON.stringify(["/_akan/hmr", "/ws"]));
      expect(await (await fetch(`${server.url}/ws`)).text()).toBe("polling");
      const reply = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws?user=2`);
        ws.onopen = () => ws.send("hello");
        ws.onmessage = (e) => (resolve(String(e.data)), ws.close());
        ws.onerror = () => reject(new Error("socket failed"));
      });
      expect(reply).toBe("server hello ?user=2");
    } finally {
      server.stop();
      upstreamServer.stop(true);
    }
  }, 30_000);
});

describe("dev start path and LAN address (O4-3, O4-5)", async () => {
  const { checkStartPath } = await import("../src/lib/prepare.ts");
  const { lanAddress } = await import("../src/lib/hmr.ts");
  test("a start path is a path on the app's origin, never akan-native's own", () => {
    expect(checkStartPath("/en/?csr=true&akanMobileTarget=default")).toBe("/en/?csr=true&akanMobileTarget=default");
    for (const bad of ["en/", "//evil.example/x", "/__akan_native/init.js", "/__akan_native", "/a b"])
      expect(() => checkStartPath(bad)).toThrow("start path");
  });

  test("the Mac's private IPv4 address, skipping loopback, VPN tunnels and bridges", () => {
    const iface = (address: string, internal = false) => ({
      address,
      family: "IPv4",
      internal,
      netmask: "",
      mac: "",
      cidr: null,
    });
    expect(
      lanAddress({
        lo0: [iface("127.0.0.1", true)],
        utun4: [iface("10.8.0.2")],
        en0: [iface("192.168.0.23")],
      } as never),
    ).toBe("192.168.0.23");
    expect(lanAddress({ en0: [iface("203.0.113.5")] } as never)).toBeUndefined();
  });
});
