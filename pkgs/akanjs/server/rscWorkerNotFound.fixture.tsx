import { ID } from "akanjs/base";
import { type ReactNode, Suspense } from "react";
import { layout, page } from "../client/route/routeBuilders";
import { router } from "../client/router";
import { untrackedCookies, untrackedHeaders } from "../fetch";
import type { PagesContext } from "./routeTreeBuilder";

const requestTag = () =>
  `theme=${untrackedCookies().get("theme")?.value ?? "-"} base=${untrackedHeaders().get("x-base-path") ?? "-"}`;

const StreamedTag = async () => {
  await Bun.sleep(300);
  return <p>{`streamed ${requestTag()}`}</p>;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
    NotFound: ({ pathname }: { pathname: string }) => <p>{`root missing ${pathname} ${requestTag()}`}</p>,
  }),
  "./slowread/_index.tsx": async () => ({
    default: page().render(async () => {
      const tag = requestTag();
      await Bun.sleep(1000);
      return <p>{`slow ${tag}`}</p>;
    }),
  }),
  "./afterawait/_index.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(300);
      return <p>{`after ${requestTag()}`}</p>;
    }),
  }),
  "./streamed/_index.tsx": async () => ({
    default: page().render(() => (
      <Suspense fallback={<i>streaming</i>}>
        <StreamedTag />
      </Suspense>
    )),
  }),
  "./nfprobesync/_index.tsx": async () => ({ default: page().render(() => router.notFound()) }),
  "./nfprobe/_index.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(50);
      return router.notFound();
    }),
  }),
  "./rdsync/_index.tsx": async () => ({ default: page().render(() => router.redirect("/target")) }),
  "./rdresolved/_index.tsx": async () => ({
    default: page().render(async () => {
      await Promise.resolve();
      return router.redirect("/target");
    }),
  }),
  "./rdio/_index.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(20);
      return router.redirect("/target");
    }),
  }),
  "./gate/_layout.tsx": async () => ({
    default: layout().render(({ children }) => {
      router.redirect("/signin");
      return <section>{children}</section>;
    }),
  }),
  "./gate/inner.tsx": async () => ({ default: page().render(() => <p>inner</p>) }),
  "./guarded/_layout.tsx": async () => ({
    default: layout()
      .guard(async () => {
        await Bun.sleep(20);
        if (untrackedHeaders().get("x-signed-in") !== "yes") router.redirect("/signin");
      })
      .render(({ children }) => <section>guarded:{children}</section>),
  }),
  "./guarded/[itemId].tsx": async () => ({
    default: page()
      .param("itemId", String)
      .guard(async ({ itemId }) => {
        await Bun.sleep(10);
        if (itemId === "other") throw Object.assign(new Error("Access denied by guard"), { statusCode: 403 });
      })
      .render(({ itemId }) => <p>{`item ${itemId}`}</p>),
  }),
  "./vault/_layout.tsx": async () => ({
    default: layout()
      .guard(() => {
        if (untrackedHeaders().get("x-signed-in") !== "yes") router.redirect("/signin");
      })
      .notFound(() => <p>vault missing</p>)
      .render(({ children }) => <section>vault:{children}</section>),
  }),
  "./vault/[noteId].tsx": async () => ({
    default: page()
      .param("noteId", ID)
      .render(({ noteId }) => <p>{`note ${noteId}`}</p>),
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
  "./pending/_layout.tsx": async () => ({
    default: layout().render(({ children }) => (
      <section>
        <StreamedTag />
        {children}
      </section>
    )),
  }),
  "./pending/gone.tsx": async () => ({ default: page().render(() => router.notFound()) }),
  "./pending/moved.tsx": async () => ({ default: page().render(() => router.redirect("/target")) }),
  "./titled/_layout.tsx": async () => ({
    default: layout()
      .head(<title>Titled Layout</title>)
      .render(({ children }) => <section>titled:{children}</section>),
  }),
  "./titled/headgone.tsx": async () => ({
    default: page()
      .head(() => router.notFound())
      .render(() => <p>headgone body</p>),
  }),
  "./titled/gone.tsx": async () => ({
    default: page()
      .head(<title>Gone Title</title>)
      .render(() => router.notFound()),
  }),
  "./shelf/[shelfId]/_layout.tsx": async () => ({
    default: layout()
      .param("shelfId", String)
      .head(({ shelfId }) => (shelfId === "gone" ? router.notFound() : <title>Shelf</title>))
      .render(({ children }) => <section>shelf:{children}</section>),
  }),
  "./shelf/[shelfId]/_index.tsx": async () => ({
    default: page()
      .param("shelfId", String)
      .render(({ shelfId }) => <p>{`shelf ${shelfId}`}</p>),
  }),
  "./docs/gone.tsx": async () => ({
    default: page().render(async () => {
      await Bun.sleep(20);
      return router.notFound();
    }),
  }),
};
