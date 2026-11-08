import { afterEach, describe, expect, test } from "bun:test";
import { TunnelGate } from "./TunnelGate";
import { TunnelShare } from "./TunnelShare";

const stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

const startApp = () => {
  const seen: { path: string; debug: string | null }[] = [];
  const server = Bun.serve<{ path: string }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req, server) => {
      const url = new URL(req.url);
      seen.push({ path: url.pathname, debug: req.headers.get("x-akan-debug") });
      if (server.upgrade(req, { data: { path: url.pathname } })) return undefined;
      if (url.pathname === "/zipped")
        return new Response(Bun.gzipSync("zipped page"), { headers: { "content-encoding": "gzip" } });
      if (url.pathname === "/moved") return new Response(null, { status: 302, headers: { location: "/elsewhere" } });
      return new Response(`page ${url.pathname}${url.search}`);
    },
    websocket: {
      message: (ws, message) => {
        ws.send(`echo ${ws.data.path} ${String(message)}`);
      },
    },
  });
  stops.push(() => void server.stop(true));
  return { origin: `http://localhost:${server.port}`, seen };
};

const openGate = (origin: string) => {
  const gate = new TunnelGate(origin);
  stops.push(() => gate.stop());
  return gate;
};

const echoOver = (url: string) =>
  new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => ws.send("hi");
    ws.onmessage = (event) => {
      resolve(String(event.data));
      ws.close();
    };
    ws.onerror = () => reject(new Error("websocket refused"));
  });

describe("TunnelGate", () => {
  test("tells dev-only routes from the routes a page needs", () => {
    for (const pathname of [
      "/_akan/devtools",
      "/_akan/signal",
      "/_akan/deps",
      "/_akan/hmr",
      "/_akan/app/logs",
      "/_akan/ops/snapshot",
      "//_akan/devtools",
      "/_akan//hmr",
      "/_akan/%64evtools",
      "/_AKAN/DEVTOOLS",
      "/_akan/csr-dev/page.js.map",
      "/%E0%A4%A",
    ])
      expect(TunnelGate.isDevRoute(pathname)).toBe(true);
    for (const pathname of [
      "/",
      "/en/tasks",
      "/_akan/ssr-dev/page.js",
      "/_akan/csr-dev/page.js",
      "/_akan/client/chunk.js",
      "/_akan/dict/en.js",
      "/_akan/styles/app.css",
      "/_akan/image",
      "/_akan/devtoolsx",
      "/api/task",
    ])
      expect(TunnelGate.isDevRoute(pathname)).toBe(false);
  });

  test("answers dev-only routes itself and relays the rest unchanged", async () => {
    const app = startApp();
    const gate = openGate(app.origin);

    const page = await fetch(`${gate.origin}/en/tasks?page=2`, { headers: { "x-akan-debug": "1", "x-other": "kept" } });
    expect(await page.text()).toBe("page /en/tasks?page=2");
    expect(app.seen.at(-1)).toEqual({ path: "/en/tasks", debug: null });

    const zipped = await fetch(`${gate.origin}/zipped`);
    expect(await zipped.text()).toBe("zipped page");
    const moved = await fetch(`${gate.origin}/moved`, { redirect: "manual" });
    expect([moved.status, moved.headers.get("location")]).toEqual([302, "/elsewhere"]);

    const before = app.seen.length;
    for (const blocked of ["/_akan/devtools", "/_akan/app/logs", "/_akan/client/chunk.js.map"])
      expect((await fetch(`${gate.origin}${blocked}`)).status).toBe(404);
    expect(app.seen.length).toBe(before);
  });

  test("relays websockets but the HMR socket", async () => {
    const app = startApp();
    const gate = openGate(app.origin);
    const wsOrigin = gate.origin.replace(/^http/, "ws");

    expect(await echoOver(`${wsOrigin}/ws`)).toBe("echo /ws hi");
    await expect(echoOver(`${wsOrigin}/_akan/hmr`)).rejects.toThrow("websocket refused");
    expect(app.seen.some(({ path }) => path === "/_akan/hmr")).toBe(false);
  });

  test("reports a local app that does not answer", async () => {
    const app = startApp();
    const gate = openGate(app.origin);
    stops.splice(0, 1)[0]?.();
    expect((await fetch(`${gate.origin}/`)).status).toBe(502);
  });

  test("a share says it needs no sign-in and what it keeps local", () => {
    expect(TunnelShare.exposureNotice("demo", false)).toContain("reaches demo on this machine, without signing in");
    expect(TunnelShare.exposureNotice("demo", false)).toContain("stay local");
    expect(TunnelShare.exposureNotice("demo", true)).toContain("also hands them devtools");
  });
});
