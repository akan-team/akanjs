import { Logger } from "akanjs/common";
import type { ReactNode } from "react";
import { page } from "../client/route/routeBuilders";
import type { PagesContext } from "./routeTreeBuilder";

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
  }),
  "./hello/_index.tsx": async () => ({
    default: page().render(() => {
      new Logger("HelloPage").warn("hello page rendering");
      return <p>hello</p>;
    }),
  }),
};
