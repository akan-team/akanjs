import type { ReactNode } from "react";
import { layout, page } from "../client/route/routeBuilders";
import { headers } from "../fetch";
import { RouteCacheTally } from "./routeCacheTally";
import type { PagesContext } from "./routeTreeBuilder";

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./plain.tsx": async () => ({ default: page().render(() => <p>plain body</p>) }),
  "./language.tsx": async () => ({
    default: page().render(() => <p>{`language=${headers().get("accept-language") ?? "-"}`}</p>),
  }),
  "./list.tsx": async () => ({
    default: page()
      .search("sort", String)
      .render(({ sort }) => <p>{`sort=${sort ?? "-"}`}</p>),
  }),
  "./exact.tsx": async () => ({
    default: page()
      .config({ canonicalQuery: false })
      .render(() => <p>exact body</p>),
  }),
  "./archive/_layout.tsx": async () => ({
    default: layout()
      .config({ canonicalQuery: false })
      .render(({ children }) => children),
  }),
  "./archive/item.tsx": async () => ({ default: page().render(() => <p>archive body</p>) }),
  "./campaign.tsx": async () => ({
    default: page()
      .search("utm_source", String)
      .render(({ utm_source }) => <p>{`source=${utm_source ?? "-"}`}</p>),
  }),
  "./tally.tsx": async () => ({
    default: page().render(() => {
      const { hit, miss } = RouteCacheTally.snapshot().rsc;
      return (
        <p>{`tally=${hit["requested-query"]},${miss["requested-query"]},${hit["rewritten-query"]},${miss["rewritten-query"]}`}</p>
      );
    }),
  }),
  "./legacy.tsx": async () => ({
    default: (({ searchParams }: { searchParams: Record<string, string> }) => (
      <p>{`legacy=${JSON.stringify(searchParams)}`}</p>
    )) as never,
  }),
};
