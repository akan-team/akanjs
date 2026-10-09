import { ID } from "akanjs/base";
import type { ReactNode } from "react";
import { layout, page } from "../client/route/routeBuilders";
import { router } from "../client/router";
import type { PagesContext } from "./routeTreeBuilder";

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
    NotFound: ({ pathname }: { pathname: string }) => <p>root missing {pathname}</p>,
  }),
  "./nfprobesync/_index.tsx": async () => ({ default: page().render(() => router.notFound()) }),
  "./nfprobe/_index.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(50);
      return router.notFound();
    }),
  }),
  "./drawing/[drawingId]/_index.tsx": async () => ({
    default: page()
      .param("drawingId", ID)
      .render(({ drawingId }) => <p>{`drawing ${drawingId}`}</p>),
  }),
  "./docs/_layout.tsx": async () => ({
    default: layout().render(async ({ children }) => {
      await Bun.sleep(10);
      return <section>docs:{children}</section>;
    }),
  }),
  "./docs/gone.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(20);
      return router.notFound();
    }),
  }),
};
