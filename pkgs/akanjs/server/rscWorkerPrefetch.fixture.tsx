import { appendFileSync } from "node:fs";
import type { ReactNode } from "react";
import { layout, page } from "../client/route/routeBuilders";
import type { PagesContext } from "./routeTreeBuilder";

const rendered = (name: string) => {
  if (process.env.AKAN_TEST_RENDER_LOG) appendFileSync(process.env.AKAN_TEST_RENDER_LOG, `${name}\n`);
  return <p>{`${name} body`}</p>;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./views.tsx": async () => ({
    default: page()
      .config({ prefetch: false })
      .render(() => rendered("views")),
  }),
  "./plain.tsx": async () => ({ default: page().render(() => rendered("plain")) }),
  "./counted/_layout.tsx": async () => ({
    default: layout()
      .config({ prefetch: false })
      .render(({ children }) => children),
  }),
  "./counted/item.tsx": async () => ({ default: page().render(() => rendered("counted item")) }),
  "./counted/open.tsx": async () => ({
    default: page()
      .config({ prefetch: true })
      .render(() => rendered("counted open")),
  }),
};
