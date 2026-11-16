import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from "bun:test";
import type { BaseEnv } from "akanjs/base";
import { getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
import { SignalContext } from "../../signal/signalContext";
import * as trace from "../../signal/trace";
import type { DiLifecycle } from "../di/diLifecycle";
import { DevSurfaces } from "../routing/devSurfaces";
import { DevtoolsRouter } from "./devtoolsRouter";

type Handler = (req: Request) => Response | Promise<Response>;
type Routes = Record<string, Record<string, Handler>>;

const secret = "s3cret-value-of-at-least-32-characters";

const routesFor = (environment: string, appName = "devtools"): Routes =>
  new DevtoolsRouter({
    di: {
      live: getDefaultLiveRegistry(),
      registry: getDefaultInjectRegistry(),
      modules: {
        database: new Map(),
        service: new Map(),
        scalar: new Map(),
        adaptor: new Map(),
        middleware: new Map(),
      },
      hierarchy: { adaptorStages: [], serviceStages: [] },
    } as unknown as DiLifecycle,
    env: {
      repoName: "akan",
      serveDomain: "example.com",
      appName,
      environment,
      operationMode: "local",
    } as BaseEnv,
    name: "AkanServer",
    serverMode: "all",
    prefix: "/api",
    websocketPrefix: "/ws",
    openapi: false,
    web: false,
    getStatus: () => "running",
  }).createRoutes() as Routes;

const get = (routes: Routes, path: string, headers: Record<string, string> = {}) =>
  routes[path].GET(new Request(`http://localhost${path}`, { headers }));

const unlock = (routes: Routes, fields: Record<string, string>) => {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return routes["/_akan/devtools/unlock"].POST(
    new Request("http://localhost/_akan/devtools/unlock", { method: "POST", body }),
  );
};

const cookieOf = (response: Response) => (response.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";

beforeEach(() => {
  process.env.AKAN_DEVTOOLS = "true";
  process.env.AKAN_LOG_DEBUG_HEADER = secret;
});

afterEach(() => {
  delete process.env.AKAN_DEVTOOLS;
  delete process.env.AKAN_LOG_DEBUG_HEADER;
  setSystemTime();
  SignalContext.setHttpPeerResolver(null);
});

const from = (address: string) => SignalContext.setHttpPeerResolver(() => ({ address, family: "IPv4", port: 5000 }));

describe("devtools outside a local runtime", () => {
  test("answers only a caller that sends the AKAN_LOG_DEBUG_HEADER secret", async () => {
    const routes = routesFor("debug");
    const refused = await get(routes, "/_akan/deps");
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: "Send the AKAN_LOG_DEBUG_HEADER secret as x-akan-debug" });
    expect((await get(routes, "/_akan/deps", { "x-akan-debug": "guess" })).status).toBe(401);
    expect((await get(routes, "/_akan/devtools", { "x-akan-debug": secret })).status).toBe(200);
  });

  test("shows a browser a form that posts the secret, so it never rides in a URL", async () => {
    const page = await get(routesFor("debug"), "/_akan/studio", { accept: "text/html" });
    expect(page.status).toBe(401);
    expect(page.headers.get("content-security-policy")).toContain("form-action 'self'");
    expect(page.headers.get("cache-control")).toBe("no-store");
    const html = await page.text();
    expect(html).toContain('<form method="post" action="/_akan/devtools/unlock">');
    expect(html).toContain('<input type="hidden" name="next" value="/_akan/studio">');
    expect(html).not.toContain(secret);
  });

  test("unlocks a browser for 15 minutes with an HttpOnly, Secure, SameSite=Strict cookie on each devtools path", async () => {
    const routes = routesFor("debug");
    const wrong = await unlock(routes, { secret: "guess", next: "/_akan/deps" });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain("does not match");
    expect(wrong.headers.getSetCookie()).toEqual([]);

    const unlocked = await unlock(routes, { secret, next: "/_akan/deps?x=1" });
    expect(unlocked.status).toBe(303);
    expect(unlocked.headers.get("location")).toBe("/_akan/deps?x=1");
    const paths = DevSurfaces.all.filter(({ gate }) => gate === "devtools").map(({ path }) => path);
    expect(unlocked.headers.getSetCookie().map((cookie) => cookie.split("; ").slice(1))).toEqual(
      paths.map((path) => [`Path=${path}`, "Max-Age=900", "HttpOnly", "Secure", "SameSite=Strict"]),
    );
    const cookie = cookieOf(unlocked);
    expect(cookie).not.toContain(secret);
    expect((await get(routes, "/_akan/devtools", { cookie })).status).toBe(200);
    expect((await get(routes, "/_akan/deps", { cookie: `${cookie.slice(0, -2)}xx` })).status).toBe(401);

    setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
    expect((await get(routes, "/_akan/deps", { cookie })).status).toBe(401);
  });

  test("ends every unlock when the secret changes", async () => {
    const routes = routesFor("debug");
    const cookie = cookieOf(await unlock(routes, { secret }));
    process.env.AKAN_LOG_DEBUG_HEADER = "rotated-value-of-at-least-32-characters";
    expect((await get(routes, "/_akan/deps", { cookie })).status).toBe(401);
  });

  test("keeps an unlock to the app and environment that granted it, though they share the secret", async () => {
    const cookie = cookieOf(await unlock(routesFor("debug"), { secret }));
    expect((await get(routesFor("debug"), "/_akan/devtools", { cookie })).status).toBe(200);
    expect((await get(routesFor("main"), "/_akan/devtools", { cookie })).status).toBe(401);
    expect((await get(routesFor("debug", "other"), "/_akan/devtools", { cookie })).status).toBe(401);
  });

  test("sends an unlocked browser back only to a devtools page on its own origin", async () => {
    const routes = routesFor("debug");
    const locationAfter = async (next: string) => (await unlock(routes, { secret, next })).headers.get("location");
    for (const next of [
      "//other.example/_akan/studio",
      "https://other.example/_akan/studio",
      "/\\other.example/_akan/studio",
      "/..//_akan/studio",
      "/./\\/other.example/_akan/studio",
      "//_akan/studio",
      "/_akan//studio",
      "/_akan/%64evtools",
      "/_AKAN/STUDIO",
      "/_akan/devtools/unlock",
      "/_akan/hmr",
      "/en/home",
    ])
      expect([next, await locationAfter(next)]).toEqual([next, "/_akan/devtools"]);
    expect(await locationAfter("/_akan/studio?view=erd")).toBe("/_akan/studio?view=erd");
    expect(await locationAfter("/_akan/studio/graph")).toBe("/_akan/studio/graph");
  });

  test("compares a wrong secret as fully as a right one, on the header, the cookie and the form", async () => {
    const routes = routesFor("debug");
    const cookie = cookieOf(await unlock(routes, { secret }));
    const compare = spyOn(trace, "sameSecret");
    const comparisons = async (sends: (() => Promise<Response> | Response)[]) => {
      const counts: number[] = [];
      for (const send of sends) {
        const before = compare.mock.calls.length;
        await send();
        counts.push(compare.mock.calls.length - before);
      }
      return counts;
    };
    try {
      const sent: Record<string, string>[] = [
        {},
        { "x-akan-debug": "guess" },
        { "x-akan-debug": secret },
        { cookie: "akan-devtools=1.x" },
        { cookie },
      ];
      const presented = await comparisons(sent.map((headers) => () => get(routes, "/_akan/devtools", headers)));
      expect(presented).toEqual([2, 2, 2, 2, 2]);
      const posted: Record<string, string>[] = [{}, { secret: "guess" }, { secret }];
      const unlocks = await comparisons(posted.map((fields) => () => unlock(routes, fields)));
      expect(unlocks).toEqual([1, 1, 1]);
    } finally {
      compare.mockRestore();
    }
  });

  test("answers 429 once one address sends ten wrong secrets in a minute, and only that address", async () => {
    const routes = routesFor("debug");
    from("198.51.100.7");
    for (let attempt = 0; attempt < 10; attempt++)
      expect((await unlock(routes, { secret: `guess-${attempt}` })).status).toBe(401);
    const blocked = await unlock(routes, { secret });
    expect([blocked.status, blocked.headers.get("retry-after")]).toEqual([429, "60"]);
    from("198.51.100.8");
    expect((await unlock(routes, { secret })).status).toBe(303);
    setSystemTime(new Date(Date.now() + 61_000));
    from("198.51.100.7");
    expect((await unlock(routes, { secret })).status).toBe(303);
  });

  test("stays closed and names the missing setting when no secret is set", () => {
    delete process.env.AKAN_LOG_DEBUG_HEADER;
    const warn = spyOn(DevtoolsRouter.logger, "warn").mockImplementation(() => undefined);
    try {
      expect(routesFor("debug")).toEqual({});
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("AKAN_LOG_DEBUG_HEADER"));
    } finally {
      warn.mockRestore();
    }
  });

  test("stays closed and says why when the secret is shorter than 32 characters", async () => {
    process.env.AKAN_LOG_DEBUG_HEADER = "x".repeat(31);
    const warn = spyOn(DevtoolsRouter.logger, "warn").mockImplementation(() => undefined);
    try {
      expect(routesFor("debug")).toEqual({});
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("AKAN_LOG_DEBUG_HEADER is shorter than 32 characters"));
    } finally {
      warn.mockRestore();
    }
    process.env.AKAN_LOG_DEBUG_HEADER = "x".repeat(32);
    expect((await get(routesFor("debug"), "/_akan/devtools", { "x-akan-debug": "x".repeat(32) })).status).toBe(200);
  });

  test("needs no secret and mounts no unlock form in a local runtime", async () => {
    const routes = routesFor("local");
    expect(routes["/_akan/devtools/unlock"]).toBeUndefined();
    expect((await get(routes, "/_akan/devtools")).status).toBe(200);
  });
});
