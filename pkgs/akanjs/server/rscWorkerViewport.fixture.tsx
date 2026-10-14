import type { ReactNode } from "react";
import { page } from "../client/route/routeBuilders";
import type { PagesContext } from "./routeTreeBuilder";

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
    theme: "dark",
    manifest: { name: "Fixture", shortName: "Fx", startUrl: "/", themeColor: "#0b1020" },
    viewport: {
      fitCover: true,
      interactiveWidget: "resizes-content",
      themeColor: { light: "#fafafa", dark: "#0b1020" },
    },
    head: (
      <>
        <title>fixture-root-title</title>
        <link rel="icon" href="/fixture.ico" />
      </>
    ),
  }),
  "./viewport.tsx": async () => ({
    default: page()
      .head(<title>fixture-page-title</title>)
      .render(() => <p>viewport body</p>),
  }),
  "./own-manifest.tsx": async () => ({
    default: page()
      .head(<link rel="manifest" href="/fixture.webmanifest" />)
      .render(() => <p>own manifest body</p>),
  }),
};
