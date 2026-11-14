import { type ReactNode, Suspense } from "react";
import { page } from "../client/route/routeBuilders";
import type { PagesContext } from "./routeTreeBuilder";

const Pending = async () => {
  await new Promise<never>(() => undefined);
  return null;
};

const Late = async () => {
  await Bun.sleep(20);
  return <p>late body</p>;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./cached.tsx": async () => ({ default: page().render(() => <p>cached body</p>) }),
  "./streamed.tsx": async () => ({
    default: page().render(() => (
      <main>
        <p>shell</p>
        <Suspense fallback={<i>loading</i>}>
          <Late />
        </Suspense>
      </main>
    )),
  }),
  "./pending.tsx": async () => ({
    default: page().render(() => (
      <main>
        <p>shell</p>
        <Pending />
      </main>
    )),
  }),
};
