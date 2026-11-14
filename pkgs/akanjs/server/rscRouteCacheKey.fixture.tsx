import type { ReactNode } from "react";
import { page } from "../client/route/routeBuilders";
import { headers } from "../fetch";
import type { PagesContext } from "./routeTreeBuilder";

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./plain.tsx": async () => ({ default: page().render(() => <p>plain body</p>) }),
  "./language.tsx": async () => ({
    default: page().render(() => <p>{`language=${headers().get("accept-language") ?? "-"}`}</p>),
  }),
};
