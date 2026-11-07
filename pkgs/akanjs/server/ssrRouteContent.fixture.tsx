import type { ReactNode } from "react";
import { layout, page } from "../client/route/routeBuilders";
import { router } from "../client/router";
import type { PagesContext } from "./routeTreeBuilder";

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
  }),
  "./quick/_index.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(30);
      return <p id="quick">quick content</p>;
    }),
  }),
  "./large/_index.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(30);
      return <article id="large">{"x".repeat(30_000)}</article>;
    }),
  }),
  "./loading/_index.tsx": async () => ({
    default: page()
      .loading(() => <i>page loading</i>)
      .render(async () => {
        await Bun.sleep(300);
        return <p>loaded content</p>;
      }),
  }),
  "./section/_layout.tsx": async () => ({
    default: layout()
      .loading(() => <i>section loading</i>)
      .render(async ({ children }) => {
        await Bun.sleep(20);
        return <section>section:{children}</section>;
      }),
  }),
  "./section/inner.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(30);
      return <p>inner content</p>;
    }),
  }),
  "./gone/_index.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(20);
      return router.notFound();
    }),
  }),
  "./moved/_index.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(20);
      return router.redirect("/quick");
    }),
  }),
  "./broken/_index.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(20);
      throw new Error("page broke");
    }),
  }),
};
