import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import { AkanNotFoundError, RouteGuards } from "akanjs/client";
import { Logger } from "akanjs/common";
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

  it("lets the memo pages open on a server it admits, and answers a missing memo not-found", async () => {
    expect(await fetch.memo(memoId)).toMatchObject({ id: memoId });
    await guardsOf(memoPage, {});
    await guardsOf(memoViewPage, { memoId });
    await expect(guardsOf(memoViewPage, { memoId: "000000000000000000000000" })).rejects.toBeInstanceOf(
      AkanNotFoundError,
    );
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
});
