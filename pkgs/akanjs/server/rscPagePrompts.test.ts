import { describe, expect, test } from "bun:test";
import { ID } from "akanjs/base";
import type { ReactNode } from "react";
import { layout, page } from "../client/route/routeBuilders";
import { AppScope } from "../fetch/appScope";
import {
  createRequestStore,
  memoizeRequestQuery,
  recordRequestQuery,
  requestStorage,
  untrackedHeaders,
} from "../fetch/requestStorage";
import { RouteTreeBuilder } from "./routeTreeBuilder";
import { RscPagePrompts } from "./rscPagePrompts";

const itemId = "507f1f77bcf86cd799439011";

const record = (key: string, args: Record<string, unknown>, value: Promise<unknown>, modelType?: string) =>
  recordRequestQuery({ key, args, returns: { refName: modelType ? "item" : "String", modelType }, value });

const routes = new RouteTreeBuilder({
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./item/[itemId]/_layout.tsx": async () => ({
    default: layout().render(({ children }) => {
      record("self", {}, Promise.resolve("me"));
      return children;
    }),
  }),
  "./item/[itemId]/_index.tsx": async () => ({
    default: page()
      .param("itemId", ID, { desc: "The item." })
      .search("tags", [String])
      .prompt("briefItem", "Brief one item.")
      .render(async (args) => {
        record("item", { itemId: args.itemId }, Promise.resolve({ id: args.itemId }), "full");
        record("tagsOf", { tags: args.tags }, Promise.reject(new Error("nope")));
        return null;
      }),
  }),
  "./plain.tsx": async () => ({ default: page().render(() => null) }),
  "./gate.tsx": async () => ({
    default: page()
      .prompt("gate", "Gated.")
      .render(() => {
        throw Object.assign(new Error("redirect"), { digest: "AKAN_REDIRECT", location: "/signin" });
      }),
  }),
  "./owned.tsx": async () => ({
    default: page()
      .prompt("owned", "Somebody else's.")
      .render(() => {
        throw Object.assign(new Error("Access denied by guard"), { statusCode: 403 });
      }),
  }),
}).build();

const prompts = new RscPagePrompts({
  routes: () => routes,
  run: (request, _routeId, fn) => {
    if (!requestStorage) throw new Error("no request storage");
    return requestStorage.run(createRequestStore(request), fn);
  },
  defaultLocale: () => "en",
});

describe("RscPagePrompts", () => {
  test("lists the pages that declared a prompt, alphabetically, with their arguments and route", async () => {
    expect(await prompts.list()).toEqual([
      {
        kind: "prompt",
        name: "briefItem",
        description: "Brief one item.",
        arguments: [
          { name: "itemId", description: "The item.", required: true },
          { name: "tags", description: "Comma-separated list.", required: false },
        ],
        pattern: "/:lang/item/:itemId",
      },
      { kind: "prompt", name: "gate", description: "Gated.", arguments: [], pattern: "/:lang/gate" },
      { kind: "prompt", name: "owned", description: "Somebody else's.", arguments: [], pattern: "/:lang/owned" },
    ]);
    expect(await prompts.list()).toBe(await prompts.list());
  });

  test("runs layouts and page in one request scope and hands back what they fetched", async () => {
    const run = await prompts.run({
      name: "briefItem",
      arguments: { itemId, tags: "a, b" },
      headers: [["authorization", "Bearer t"]],
    });
    expect(run).toMatchObject({ ok: true, url: `http://127.0.0.1/en/item/${itemId}?tags=a&tags=b` });
    if (!run.ok) return;
    expect(run.records.map((entry) => entry.key)).toEqual(["self", "item", "tagsOf"]);
    expect(run.records[1]).toEqual({
      key: "item",
      args: { itemId },
      returns: { refName: "item", modelType: "full" },
      value: { id: itemId },
    });
    expect(run.records[2]).toMatchObject({ key: "tagsOf", args: { tags: ["a", "b"] }, error: "nope" });
    expect("value" in run.records[2]).toBe(false);
  });

  test("refuses by the page's own declaration before anything runs", async () => {
    expect(await prompts.run({ name: "briefItem", arguments: {}, headers: [] })).toEqual({
      ok: false,
      reason: "argument",
      message: 'Missing required argument "itemId".',
    });
    expect(await prompts.run({ name: "briefItem", arguments: { itemId: "nope" }, headers: [] })).toEqual({
      ok: false,
      reason: "argument",
      message: 'Invalid argument "itemId": expected ID.',
    });
    expect(await prompts.run({ name: "nope", arguments: {}, headers: [] })).toEqual({
      ok: false,
      reason: "unknown",
      message: "Unknown prompt: nope.",
    });
  });

  test("reads a redirect thrown by the page body as a refusal, by digest", async () => {
    const run = await prompts.run({ name: "gate", arguments: {}, headers: [] });
    expect(run).toMatchObject({ ok: false, reason: "redirect" });
    if (run.ok) return;
    expect(run.message).toContain("/signin");
  });

  test("reads a guard's refusal of a query inside the body as the screen refusing the caller", async () => {
    expect(await prompts.run({ name: "owned", arguments: {}, headers: [] })).toEqual({
      ok: false,
      reason: "forbidden",
      message: "A query the screen makes refused the caller (403).",
    });
  });

  test("names two pages that claim one prompt", async () => {
    const twice = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
      "./a.tsx": async () => ({
        default: page()
          .prompt("same", "A.")
          .render(() => null),
      }),
      "./b.tsx": async () => ({
        default: page()
          .prompt("same", "B.")
          .render(() => null),
      }),
    }).build();
    const source = new RscPagePrompts({ routes: () => twice, run: (_req, _id, fn) => fn(), defaultLocale: () => "en" });
    await expect(source.list()).rejects.toThrow('prompt "same" is declared by both');
  });
});

describe("RscPagePrompts route guards", () => {
  const trail: string[] = [];
  const deskItemId = "507f1f77bcf86cd799439012";
  const signIn = () => {
    trail.push("desk guard");
    if (untrackedHeaders().get("authorization") !== "Bearer u1")
      throw Object.assign(new Error("redirect"), { digest: "AKAN_REDIRECT", location: "/signin" });
  };
  const guarded = new RouteTreeBuilder({
    "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
    "./desk/_layout.tsx": async () => ({
      default: layout()
        .guard(signIn)
        .render(({ children }) => {
          trail.push("desk");
          return children;
        }),
    }),
    "./desk/[itemId].tsx": async () => ({
      default: page()
        .param("itemId", ID)
        .prompt("briefDesk", "Brief a desk item.")
        .guard(({ itemId }) => {
          trail.push("item guard");
          if (itemId !== deskItemId) throw Object.assign(new Error("Access denied by guard"), { statusCode: 403 });
        })
        .render(() => {
          trail.push("item");
          return null;
        }),
    }),
    "./desk/today.tsx": async () => ({
      default: page()
        .prompt("briefToday", "Brief today's desk.")
        .render(() => null),
    }),
    "./open.tsx": async () => ({
      default: page()
        .prompt("briefOpen", "Brief what is open to all.")
        .render(() => null),
    }),
  }).build();
  const source = new RscPagePrompts({
    routes: () => guarded,
    run: (request, _routeId, fn) => {
      if (!requestStorage) throw new Error("no request storage");
      return requestStorage.run(createRequestStore(request), fn);
    },
    defaultLocale: () => "en",
  });
  const signedIn: [string, string][] = [["authorization", "Bearer u1"]];

  test("runs every guard, root first, before any layout body, and stops the screen at the first refusal", async () => {
    trail.length = 0;
    expect(await source.run({ name: "briefDesk", arguments: { itemId: deskItemId }, headers: signedIn })).toMatchObject(
      {
        ok: true,
      },
    );
    expect(trail).toEqual(["desk guard", "item guard", "desk", "item"]);

    trail.length = 0;
    const signedOut = await source.run({ name: "briefDesk", arguments: { itemId: deskItemId }, headers: [] });
    expect(signedOut).toMatchObject({ ok: false, reason: "redirect" });
    expect(trail).toEqual(["desk guard"]);
  });

  test("answers a document the guard's query refuses as one that does not exist", async () => {
    trail.length = 0;
    expect(await source.run({ name: "briefDesk", arguments: { itemId }, headers: signedIn })).toEqual({
      ok: false,
      reason: "not-found",
      message: "The page answers not-found for these arguments.",
    });
    expect(trail).toEqual(["desk guard", "item guard"]);
  });

  test("runs the guards in the request scope of the bodies, so a query both ask is fetched once", async () => {
    let fetched = 0;
    const ticketOf = (ticketId: string) =>
      memoizeRequestQuery(`ticket/${ticketId}`, async () => {
        fetched += 1;
        return { id: ticketId };
      });
    const ticketRoutes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
      "./ticket/[ticketId].tsx": async () => ({
        default: page()
          .param("ticketId", ID)
          .prompt("briefTicket", "Brief a ticket.")
          .guard(async ({ ticketId }) => {
            await ticketOf(ticketId);
          })
          .render(async ({ ticketId }) => {
            await ticketOf(ticketId);
            return null;
          }),
      }),
    }).build();
    const ticketPrompts = new RscPagePrompts({
      routes: () => ticketRoutes,
      run: (request, _routeId, fn) => {
        if (!requestStorage) throw new Error("no request storage");
        return requestStorage.run(createRequestStore(request), fn);
      },
      defaultLocale: () => "en",
    });
    expect(
      await ticketPrompts.run({ name: "briefTicket", arguments: { ticketId: itemId }, headers: [] }),
    ).toMatchObject({
      ok: true,
    });
    expect(fetched).toBe(1);
  });

  test("names the screens the caller may open, passing a guard that waits for an argument", async () => {
    const names = ["briefDesk", "briefToday", "briefOpen", "unknown"];
    expect(await source.visible({ names, headers: signedIn })).toEqual(["briefDesk", "briefOpen", "briefToday"]);
    expect(await source.visible({ names, headers: [] })).toEqual(["briefOpen"]);
    expect(await source.visible({ names: ["briefOpen"], headers: [] })).toEqual(["briefOpen"]);
  });
});

describe("RscPagePrompts apps", () => {
  const trail: string[] = [];
  const appRoutes = new RouteTreeBuilder({
    "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
    "./item/[itemId]/_layout.tsx": async () => ({
      default: layout()
        .guard(async () => {
          trail.push(`layout guard in ${AppScope.current() ?? "no app"}`);
          await record("membership", {}, Promise.resolve("member"));
        })
        .render(({ children }) => {
          trail.push("layout");
          record("self", {}, Promise.resolve("me"));
          return children;
        }),
    }),
    "./item/[itemId]/_index.tsx": async () => ({
      default: page()
        .param("itemId", ID, { desc: "The item." })
        .search("tab", String)
        .prompt("briefItem", "Brief one item.")
        .app("showItem", "Show one item.", ({ itemId }) => {
          trail.push("app");
          record("item", { itemId }, Promise.resolve({ id: itemId }), "full");
          return null;
        })
        .render(() => {
          trail.push("render");
          return null;
        }),
    }),
  }).build();
  const appPrompts = new RscPagePrompts({
    routes: () => appRoutes,
    run: (request, _routeId, fn) => {
      if (!requestStorage) throw new Error("no request storage");
      return requestStorage.run(createRequestStore(request), fn);
    },
    defaultLocale: () => "en",
  });

  test("lists each app beside the prompts, with the page's arguments", async () => {
    const entries = await appPrompts.list();
    expect(entries.map(({ kind, name }) => `${kind}:${name}`)).toEqual(["prompt:briefItem", "app:showItem"]);
    expect(entries[1]).toEqual({
      kind: "app",
      name: "showItem",
      description: "Show one item.",
      arguments: [
        { name: "itemId", description: "The item.", required: true },
        { name: "tab", required: false },
      ],
      pattern: "/:lang/item/:itemId",
    });
  });

  test("runs the route guards under the app's scope, then its load alone, and hands back where its view starts", async () => {
    trail.length = 0;
    const run = await appPrompts.run({ name: "showItem", arguments: { itemId, tab: "notes" }, headers: [] });
    expect(trail).toEqual(["layout guard in showItem", "app"]);
    expect(run).toMatchObject({
      ok: true,
      url: `http://127.0.0.1/en/item/${itemId}?tab=notes`,
      route: { params: { itemId, lang: "en" }, searchParams: { tab: "notes" } },
    });
    if (!run.ok) return;
    expect(run.records.map((entry) => entry.key)).toEqual(["item"]);

    trail.length = 0;
    const prompt = await appPrompts.run({ name: "briefItem", arguments: { itemId }, headers: [] });
    expect(trail).toEqual(["layout guard in no app", "layout", "app", "render"]);
    expect(prompt.ok && prompt.records.map((entry) => entry.key)).toEqual(["self", "item"]);
  });

  test("answers a load that writes as the page failing, before the write leaves", async () => {
    const writing = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
      "./write.tsx": async () => ({
        default: page()
          .app("writeOnLoad", "Writes while it loads.", () => {
            throw Object.assign(new Error("base.error.mutationInApp"), { statusCode: 400 });
          })
          .render(() => null),
      }),
    }).build();
    const source = new RscPagePrompts({
      routes: () => writing,
      run: (_req, _id, fn) => fn(),
      defaultLocale: () => "en",
    });
    expect(await source.run({ name: "writeOnLoad", arguments: {}, headers: [] })).toEqual({
      ok: false,
      reason: "error",
      message: "base.error.mutationInApp",
    });
  });

  test("names two pages that claim one name, whether as an app or a prompt", async () => {
    const clash = (a: "app" | "prompt", b: "app" | "prompt") => {
      const declare = (kind: "app" | "prompt", text: string) =>
        kind === "app"
          ? page()
              .app("same", text, () => null)
              .render(() => null)
          : page()
              .prompt("same", text)
              .render(() => null);
      const routes = new RouteTreeBuilder({
        "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
        "./a.tsx": async () => ({ default: declare(a, "A.") }),
        "./b.tsx": async () => ({ default: declare(b, "B.") }),
      }).build();
      return new RscPagePrompts({
        routes: () => routes,
        run: (_req, _id, fn) => fn(),
        defaultLocale: () => "en",
      }).list();
    };
    await expect(clash("app", "app")).rejects.toThrow('app "same" is declared by both /:lang/a and /:lang/b');
    await expect(clash("prompt", "app")).rejects.toThrow(
      'app "same" is declared by both /:lang/a (as its prompt) and /:lang/b',
    );
    await expect(clash("app", "prompt")).rejects.toThrow(
      'prompt "same" is declared by both /:lang/a (as its app) and /:lang/b',
    );
  });
});
