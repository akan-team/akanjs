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
