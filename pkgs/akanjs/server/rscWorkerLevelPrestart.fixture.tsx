import { Logger } from "akanjs/common";
import type { ReactNode } from "react";
import { layout, page } from "../client/route/routeBuilders";
import { router } from "../client/router";
import type { PagesContext } from "./routeTreeBuilder";

process.on("unhandledRejection", (reason) => {
  Logger.error(`unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});

const at = () => performance.now().toFixed(3);

const timedLayout = (name: string) =>
  layout().render(async ({ children }) => {
    const start = at();
    await Bun.sleep(50);
    return (
      <section>
        {`${name} ${start} ${at()}`}
        {children}
      </section>
    );
  });

const failingLayout = (fail: () => never) =>
  layout().render(async ({ children }) => {
    await Bun.sleep(20);
    fail();
    return <section>{children}</section>;
  });

const failingPage = (message: string) =>
  page().render(async () => {
    throw new Error(message);
  });

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
  }),
  "./overlap/_layout.tsx": async () => ({ default: timedLayout("outer") }),
  "./overlap/inner/_layout.tsx": async () => ({ default: timedLayout("inner") }),
  "./overlap/inner/_index.tsx": async () => ({
    default: page().render(async () => {
      const start = at();
      await Bun.sleep(50);
      return <p>{`page ${start} ${at()}`}</p>;
    }),
  }),
  "./redirected/_layout.tsx": async () => ({ default: failingLayout(() => router.redirect("/target")) }),
  "./redirected/_index.tsx": async () => ({ default: failingPage("page below a redirect") }),
  "./missing/_layout.tsx": async () => ({ default: failingLayout(() => router.notFound()) }),
  "./missing/_index.tsx": async () => ({ default: failingPage("page below a not-found") }),
  "./broken/_layout.tsx": async () => ({
    default: failingLayout(() => {
      throw new Error("layout broke");
    }),
  }),
  "./broken/_index.tsx": async () => ({ default: failingPage("page below a failure") }),
  "./failing/_layout.tsx": async () => ({
    default: layout().render(async ({ children }) => {
      await Bun.sleep(20);
      return <section>{children}</section>;
    }),
  }),
  "./failing/_index.tsx": async () => ({ default: failingPage("page failed on its own") }),
};
