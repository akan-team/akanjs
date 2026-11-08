import type { ReactNode } from "react";
import { layout, page, rootLayout } from "../client/route/routeBuilders";
import { router } from "../client/router";
import type { PagesContext } from "./routeTreeBuilder";

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: rootLayout()
      .manifest({ name: "Dex" })
      .head(
        <>
          <title>Dex</title>
          <meta name="description" content="Every creature" />
        </>,
      )
      .notFound(({ pathname }) => (
        <>
          <title>Not found – Dex</title>
          <meta name="description" content="Nothing here" />
          <p id="missing">{`missing ${pathname}`}</p>
        </>
      ))
      .render(({ children }: { children: ReactNode }) => <main>{children}</main>),
  }),
  "./creature/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .head(({ name }) => <title>{`${name} – Dex`}</title>)
      .render(async ({ name }) => {
        await Bun.sleep(20);
        if (name === "missingno") return router.notFound();
        return <p id="creature">{name}</p>;
      }),
  }),
  "./named/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .head(async ({ name }) => {
        await Bun.sleep(10);
        if (name === "missingno") return router.notFound();
        return <title>{`${name} – Dex`}</title>;
      })
      .render(({ name }) => <p id="named">{name}</p>),
  }),
  "./slow/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .head(() => <title>slow – Dex</title>)
      .loading(() => <i>loading</i>)
      .render(async () => {
        await Bun.sleep(30);
        return router.notFound();
      }),
  }),
  "./failing/_layout.tsx": async () => ({
    default: layout()
      .error(() => (
        <>
          <title>Broken – Dex</title>
          <p id="broken">broken</p>
        </>
      ))
      .render(({ children }) => <section>{children}</section>),
  }),
  "./failing/inner.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(20);
      throw new Error("inner broke");
    }),
  }),
  "./plain/_layout.tsx": async () => ({
    default: layout()
      .head(<meta name="robots" content="index, nofollow" />)
      .notFound(() => <p id="plain-missing">plain missing</p>)
      .render(({ children }) => <section>{children}</section>),
  }),
  "./plain/[name].tsx": async () => ({
    default: page()
      .param("name", String)
      .render(async () => {
        await Bun.sleep(20);
        return router.notFound();
      }),
  }),
};
