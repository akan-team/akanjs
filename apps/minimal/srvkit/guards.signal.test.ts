import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import { AkanNotFoundError, RouteGuards } from "akanjs/client";
import { Logger } from "akanjs/common";
import { createRequestStore, requestStorage } from "akanjs/fetch";
import { getOrSetupSignalTestFetch } from "akanjs/test";

import type { fetch as minimalFetch } from "../lib/useServer";
import type memoPageDefinition from "../page/(home)/memo";
import type memoViewPageDefinition from "../page/(home)/memo/[memoId]";
import type tripsPageDefinition from "../page/(tab)/trips";
import { LocalOrEdge } from "./guards";

describe("LocalOrEdge", () => {
  let fetch: typeof minimalFetch;
  let memoPage: typeof memoPageDefinition;
  let memoViewPage: typeof memoViewPageDefinition;
  let tripsPage: typeof tripsPageDefinition;
  let memoId: string;

  const guardsOf = (page: typeof memoPage | typeof memoViewPage, params: Record<string, string>) => {
    const { default: render, guard } = page.toRouteModule();
    return RouteGuards.run([render ? { render, guard } : undefined], {
      params: { lang: "en", ...params },
      searchParams: {},
    });
  };
  const listedOverMcp = (page: typeof memoPage | typeof memoViewPage) => {
    const { default: render, guard } = page.toRouteModule();
    return RouteGuards.admits([render ? { render, guard } : undefined], { params: { lang: "en" }, searchParams: {} });
  };
  const errorsLoggedBy = async (run: () => Promise<unknown>) => {
    const errors: string[] = [];
    const stop = Logger.addSink(({ plainMessage }) => void errors.push(plainMessage), { minLevel: "error" });
    try {
      await run();
    } finally {
      stop();
    }
    return errors;
  };

  const linksOf = (node: unknown): string[] => {
    if (Array.isArray(node)) return node.flatMap(linksOf);
    if (typeof node !== "object" || node === null || !("props" in node)) return [];
    const { href, children } = node.props as { href?: string; children?: unknown };
    return [...(href ? [href] : []), ...linksOf(children)];
  };
  const tripsLinks = async () => {
    const { default: render } = tripsPage.toRouteModule();
    return linksOf(await render?.({ params: { lang: "en" }, searchParams: {} }));
  };

  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<typeof minimalFetch>();
    //? Not a top-level import: the client barrel builds its fetch on import, and getEnv() throws before the harness runs.
    memoPage = (await import("../page/(home)/memo")).default;
    memoViewPage = (await import("../page/(home)/memo/[memoId]")).default;
    tripsPage = (await import("../page/(tab)/trips")).default;
    memoId = (await fetch.createMemo({ name: "Check-in at 3pm" })).id;
  });

  afterEach(() => {
    mock.restore();
  });

  it("lets the memo pages open on a server it admits, and answers a missing memo not-found without an error line", async () => {
    expect(await fetch.memo(memoId)).toMatchObject({ id: memoId });
    await guardsOf(memoPage, {});
    await guardsOf(memoViewPage, { memoId });
    const errors = await errorsLoggedBy(async () => {
      await expect(guardsOf(memoViewPage, { memoId: "000000000000000000000000" })).rejects.toBeInstanceOf(
        AkanNotFoundError,
      );
    });
    expect(errors).toEqual([]);
  });

  it("answers the memo pages not-found on a server it refuses, as a built server does, without a refused call", async () => {
    spyOn(LocalOrEdge.prototype, "canPass").mockReturnValue(false);
    await expect(fetch.memoInsightInPublic()).rejects.toThrow();
    const errors = await errorsLoggedBy(async () => {
      await expect(guardsOf(memoPage, {})).rejects.toBeInstanceOf(AkanNotFoundError);
      await expect(guardsOf(memoViewPage, { memoId })).rejects.toBeInstanceOf(AkanNotFoundError);
    });
    expect(errors).toEqual([]);
  });

  it("lists the memo apps over MCP only on a server it admits, without a refused call", async () => {
    expect(await listedOverMcp(memoPage)).toBe(true);
    expect(await listedOverMcp(memoViewPage)).toBe(true);
    spyOn(LocalOrEdge.prototype, "canPass").mockReturnValue(false);
    const errors = await errorsLoggedBy(async () => {
      expect(await listedOverMcp(memoPage)).toBe(false);
      expect(await listedOverMcp(memoViewPage)).toBe(false);
    });
    expect(errors).toEqual([]);
  });

  it("links the trips page to the trip notes only on a server it admits, without being refused", async () => {
    expect(await fetch.isMemoOpen()).toBe(true);
    expect(await tripsLinks()).toContain("/memo");
    spyOn(LocalOrEdge.prototype, "canPass").mockReturnValue(false);
    expect(await fetch.isMemoOpen()).toBe(false);
    expect(await tripsLinks()).toEqual(["/trips/detail"]);
  });

  it("renders the trips page without reading the visitor's request, so the route result cache can keep it", async () => {
    const headers = { authorization: "Bearer visitor", cookie: "jwt=session", "x-real-ip": "203.0.113.5" };
    const store = createRequestStore(new Request("http://localhost/en/trips", { headers }));
    const links = await requestStorage?.run(store, tripsLinks);
    expect(links).toContain("/memo");
    expect(store.dynamicUsage).toEqual({ headers: false, cookies: false });
  });

  it("links the trips page to the trip notes when the memo check fails", async () => {
    spyOn(LocalOrEdge.prototype, "canPass").mockImplementation(() => {
      throw new Error("operation mode unreadable");
    });
    await expect(fetch.isMemoOpen()).rejects.toThrow();
    expect(await tripsLinks()).toContain("/memo");
  });

  it("links the trips page to the trip notes when the memo check outlasts its 3 s deadline", async () => {
    const answersLate = () => new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4_000));
    spyOn(LocalOrEdge.prototype, "canPass").mockImplementation(answersLate as unknown as () => boolean);
    const startedAt = performance.now();
    expect(await tripsLinks()).toContain("/memo");
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(2_500);
  }, 10_000);
});
