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
  //? A root layout with a Loading streams, so the theme it sets arrives after the first chunk.
  "./__root_layout.tsx": async () => ({ default: ThemedLayout, Loading: () => null }),
  "./themed.tsx": async () => ({ default: page().render(() => <p>themed body</p>) }),
};
