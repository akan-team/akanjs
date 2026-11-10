import { appendFileSync } from "node:fs";
import type { ReactNode } from "react";
import { layout, page } from "../client/route/routeBuilders";
import { router } from "../client/router";
import { untrackedHeaders } from "../fetch";
import type { PagesContext } from "./routeTreeBuilder";

const rendered = (name: string) => {
  if (process.env.AKAN_TEST_RENDER_LOG) appendFileSync(process.env.AKAN_TEST_RENDER_LOG, `${name}\n`);
  return <p>{`${name} body`}</p>;
};
const signedIn = () => untrackedHeaders().get("x-signed-in") === "yes";

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./views.tsx": async () => ({
    default: page()
      .config({ prefetch: false })
      .render(() => rendered("views")),
  }),
  "./plain.tsx": async () => ({ default: page().render(() => rendered("plain")) }),
  "./counted/_layout.tsx": async () => ({
    default: layout()
      .config({ prefetch: false })
      .render(({ children }) => children),
  }),
  "./counted/item.tsx": async () => ({ default: page().render(() => rendered("counted item")) }),
  "./counted/open.tsx": async () => ({
    default: page()
      .config({ prefetch: true })
      .render(() => rendered("counted open")),
  }),
  "./vault/_layout.tsx": async () => ({
    default: layout()
      .config({ prefetch: false })
      .guard(() => {
        if (!signedIn()) router.redirect("/en/signin");
      })
      .render(({ children }) => children),
  }),
  "./vault/item.tsx": async () => ({ default: page().render(() => rendered("vault item")) }),
  "./sealed/_layout.tsx": async () => ({
    default: layout()
      .config({ prefetch: false })
      .guard(() => {
        if (!signedIn()) router.notFound();
      })
      .render(({ children }) => children),
  }),
  "./sealed/item.tsx": async () => ({ default: page().render(() => rendered("sealed item")) }),
  "./records/_layout.tsx": async () => ({
    default: layout()
      .config({ prefetch: false })
      .render(({ children }) => children),
  }),
  "./records/[recordId].tsx": async () => ({
    default: page()
      .param("recordId", String)
      .guard(() => {
        if (!signedIn()) router.notFound();
      })
      .render(() => rendered("record")),
  }),
};
