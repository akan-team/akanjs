import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import { AkanNotFoundError, RouteGuards } from "akanjs/client";
import { getOrSetupSignalTestFetch } from "akanjs/test";

import type { fetch as minimalFetch } from "../lib/useServer";
import type memoPageDefinition from "../page/(home)/memo";
import type memoViewPageDefinition from "../page/(home)/memo/[memoId]";
import { LocalOrEdge } from "./guards";

describe("LocalOrEdge", () => {
  let fetch: typeof minimalFetch;
  let memoPage: typeof memoPageDefinition;
  let memoViewPage: typeof memoViewPageDefinition;
  let memoId: string;

  const guardsOf = (page: typeof memoPage | typeof memoViewPage, params: Record<string, string>) => {
    const { default: render, guard } = page.toRouteModule();
    return RouteGuards.run([render ? { render, guard } : undefined], {
      params: { lang: "en", ...params },
      searchParams: {},
    });
  };

  beforeAll(async () => {
    fetch = await getOrSetupSignalTestFetch<typeof minimalFetch>();
    //? Not a top-level import: the client barrel builds its fetch on import, and getEnv() throws before the harness runs.
    memoPage = (await import("../page/(home)/memo")).default;
    memoViewPage = (await import("../page/(home)/memo/[memoId]")).default;
    memoId = (await fetch.createMemo({ name: "Check-in at 3pm" })).id;
  });

  afterEach(() => {
    mock.restore();
  });

  it("lets the memo pages open on a server it admits", async () => {
    expect(await fetch.memo(memoId)).toMatchObject({ id: memoId });
    await guardsOf(memoPage, {});
    await guardsOf(memoViewPage, { memoId });
  });

  it("answers the memo pages not-found on a server it refuses, as a built server does", async () => {
    spyOn(LocalOrEdge.prototype, "canPass").mockReturnValue(false);
    await expect(fetch.memoInsightInPublic()).rejects.toThrow();
    await expect(guardsOf(memoPage, {})).rejects.toBeInstanceOf(AkanNotFoundError);
    await expect(guardsOf(memoViewPage, { memoId })).rejects.toBeInstanceOf(AkanNotFoundError);
  });
});
