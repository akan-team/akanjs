import { type ReactNode, Suspense } from "react";
import { makePageProto } from "../client/makePageProto";
import { layout, page } from "../client/route/routeBuilders";
import { router } from "../client/router";
import type { PagesContext } from "./routeTreeBuilder";

const { Err } = makePageProto({});

const AfterIo = async ({ fail }: { fail: () => never }): Promise<ReactNode> => {
  await Bun.sleep(50);
  return fail();
};

const streamed = (fail: () => never) =>
  page().render(() => (
    <Suspense fallback={<i>loading</i>}>
      <AfterIo fail={fail} />
    </Suspense>
  ));

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
  }),
  "./driver/_index.tsx": async () => ({
    default: streamed(() => {
      throw new Error('duplicate key value violates unique constraint "user_email_key" (email=alice@example.com)');
    }),
  }),
  "./denied/_index.tsx": async () => ({
    default: streamed(() => {
      throw new Err("drawing.error.denied");
    }),
  }),
  "./moved/_index.tsx": async () => ({ default: streamed(() => router.redirect("/target")) }),
  "./gone/_index.tsx": async () => ({ default: streamed(() => router.notFound()) }),
  "./failing/_layout.tsx": async () => ({
    default: layout()
      .error(({ digest }) => <p>{`failing error ${digest}`}</p>)
      .render(({ children }) => <section>failing:{children}</section>),
  }),
  "./failing/denied.tsx": async () => ({
    default: page().render(() => {
      throw new Err("drawing.error.denied");
    }),
  }),
};
