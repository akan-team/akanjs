import type { ReactNode } from "react";
import { page } from "../client/route/routeBuilders";
import type { PagesContext } from "./routeTreeBuilder";

const Pending = async () => {
  await new Promise<never>(() => undefined);
  return null;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./cached.tsx": async () => ({ default: page().render(() => <p>cached body</p>) }),
  "./pending.tsx": async () => ({
    default: page().render(() => (
      <main>
        <p>shell</p>
        <Pending />
      </main>
    )),
  }),
};
