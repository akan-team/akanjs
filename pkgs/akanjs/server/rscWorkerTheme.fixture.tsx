import type { ReactNode } from "react";
import { page } from "../client/route/routeBuilders";
import { setRequestTheme } from "../fetch";
import type { PagesContext } from "./routeTreeBuilder";

const ThemedLayout = async ({ children }: { children: ReactNode }) => {
  await Bun.sleep(20);
  setRequestTheme("light");
  return <main>{children}</main>;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ThemedLayout }),
  "./themed.tsx": async () => ({ default: page().render(() => <p>themed body</p>) }),
};
