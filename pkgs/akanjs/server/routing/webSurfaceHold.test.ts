import { describe, expect, test } from "bun:test";
import type { NonNullHttpRoutes } from "./apiRouter";
import { HostAllowlist } from "./hostAllowlist";
import { WebSurfaceHold } from "./webSurfaceHold";

const server = {} as Bun.Server<unknown>;
const text = (body: string) => () => new Response(body);
const answer = async (response: Response | Promise<Response | undefined> | undefined) => {
  const res = await response;
  return res ? `${res.status} ${await res.text()}` : "none";
};
const routes = {
  "/exact": { GET: text("exact get") },
  "/static": new Response("static"),
  "/_akan/client/*": text("client"),
  "/*": text("page"),
} as unknown as NonNullHttpRoutes;

describe("WebSurfaceHold.dispatch", () => {
  test("takes the exact path, then the longest wildcard, and passes a method the map lacks on", async () => {
    const at = (path: string, method = "GET") =>
      answer(WebSurfaceHold.dispatch(routes, new Request(`http://localhost${path}`, { method }), server));

    expect(await at("/exact")).toBe("200 exact get");
    expect(await at("/exact", "POST")).toBe("200 page");
    expect(await at("/_akan/client/app.js")).toBe("200 client");
    expect(await at("/_akan/client")).toBe("200 page");
    expect(await at("/static")).toBe("200 static");
    expect(await at("/static")).toBe("200 static");
    expect(await at("/en/about")).toBe("200 page");
  });

  test("answers 404 when nothing matches, as Bun does for a table without a catch-all", async () => {
    const apiOnly = { "/api/ping": text("pong") } as unknown as NonNullHttpRoutes;

    expect(await answer(WebSurfaceHold.dispatch(apiOnly, new Request("http://localhost/en"), server))).toBe(
      "404 Not Found",
    );
  });
});

describe("WebSurfaceHold.route", () => {
  test("holds a request until the surface opens, then serves it from the table attached by then", async () => {
    const hold = new WebSurfaceHold();
    let attached: NonNullHttpRoutes | null = null;
    const held = hold.route(() => attached);
    const outcome = { done: false };
    const page = answer(held(new Request("http://localhost/en"), server)).then((result) => {
      outcome.done = true;
      return result;
    });

    await Promise.resolve();
    expect(outcome.done).toBe(false);
    expect(hold.pending).toBe(true);

    attached = routes;
    hold.open();

    expect(await page).toBe("200 page");
    expect(hold.pending).toBe(false);
    expect(await answer(held(new Request("http://localhost/exact"), server))).toBe("200 exact get");
  });

  test("answers every held request 503 with the first failure, as a page for a browser and JSON for a client", async () => {
    const hold = new WebSurfaceHold();
    const held = hold.route(() => routes);
    const browser = held(new Request("http://localhost/en", { headers: { accept: "text/html" } }), server);
    const client = held(new Request("http://localhost/en", { headers: { accept: "application/json" } }), server);

    hold.fail("pages bundle refused");
    hold.fail("a later reason");
    hold.open();

    const page = await browser;
    expect(page?.status).toBe(503);
    expect(page?.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await page?.text()).toContain("The web surface did not start: pages bundle refused");
    expect(await (await client)?.json()).toMatchObject({
      error: "base.error.serverUnavailable",
      statusCode: 503,
      details: "The web surface did not start: pages bundle refused",
    });
  });

  test("settle() lets the held 503 leave a real server before it is stopped", async () => {
    const hold = new WebSurfaceHold();
    const entered = Promise.withResolvers<void>();
    const held = hold.route(() => routes);
    const real = Bun.serve({
      port: 0,
      routes: {
        "/*": (req, srv) => {
          entered.resolve();
          return held(req, srv) as Promise<Response>;
        },
      },
    });
    const page = fetch(`http://127.0.0.1:${real.port}/en`).then(
      async (res) => `${res.status} ${await res.text()}`,
      (error: { code?: string }) => `error ${error.code}`,
    );

    try {
      await entered.promise;
      await hold.settle("the server stopped before the first base build finished");
      real.stop(true);

      expect(await page).toBe(
        "503 The web surface did not start: the server stopped before the first base build finished",
      );
    } finally {
      real.stop(true);
    }
  });
});

describe("WebSurfaceHold.guard", () => {
  test("holds a Host it cannot place yet rather than refusing it, and refuses it once the surface is up", async () => {
    const hold = new WebSurfaceHold();
    const allowlist = new HostAllowlist(["app.localhost:8282"]);
    const attached = {
      "/api/ping": text("attached pong"),
      "/*": text("attached page"),
    } as unknown as NonNullHttpRoutes;
    const held = hold.route(() => attached);
    const guarded = hold.guard(
      { "/api/ping": text("pong"), "/*": held } as unknown as NonNullHttpRoutes,
      allowlist,
      held,
    );
    const ping = guarded["/api/ping" as keyof NonNullHttpRoutes] as unknown as (
      req: Request,
      srv: Bun.Server<unknown>,
    ) => Promise<Response>;
    const at = (host: string) => ping(new Request("http://app.localhost:8282/api/ping", { headers: { host } }), server);

    expect(await answer(at("app.localhost:8282"))).toBe("200 pong");
    const early = answer(at("declared.example.org"));
    hold.open();

    expect(await early).toBe("200 attached pong");
    expect((await at("declared.example.org"))?.status).toBe(403);
  });
});
