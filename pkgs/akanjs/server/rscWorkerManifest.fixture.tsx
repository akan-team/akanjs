import type { ReactNode } from "react";
import { registerClientReference } from "react-server-dom-webpack/server.node";
import { page } from "../client/route/routeBuilders";
import type { PagesContext } from "./routeTreeBuilder";

const loads = globalThis as { akanManifestFixtureLoads?: number };
loads.akanManifestFixtureLoads = (loads.akanManifestFixtureLoads ?? 0) + 1;
//? Only a reload imports this a second time: slow enough that a render sent right after it arrives while it imports.
if (loads.akanManifestFixtureLoads > 1) await Bun.sleep(600);

//? Stands in for a worker that lost a manifest the host counts as sent, a state no message order reaches.
if (loads.akanManifestFixtureLoads === 1)
  process.prependListener("message", (message: { type?: string; url?: string; clientManifest?: unknown }) => {
    if (message.type === "render" && message.url?.includes("lost=1")) delete message.clientManifest;
  });

const Widget = registerClientReference(
  (): ReactNode => {
    throw new Error("Widget is a client component");
  },
  "manifest/widget",
  "Widget",
);

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
  "./widget.tsx": async () => ({ default: page().render(() => <Widget />) }),
};
