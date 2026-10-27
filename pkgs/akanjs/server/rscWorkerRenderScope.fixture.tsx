import { ID } from "akanjs/base";
import { type ReactNode, Suspense } from "react";
import { page } from "../client/route/routeBuilders";
import { RenderScope } from "../fetch";
import { FetchClient } from "../fetch/client/fetchClient";
import type { PagesContext } from "./routeTreeBuilder";

const apiOrigin = "http://render-scope.test";
const passThrough = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
  String(input).startsWith(apiOrigin)
    ? Response.json("approved")
    : passThrough(input as Request, init)) as typeof fetch;

const client = new FetchClient(
  apiOrigin,
  {},
  {
    item: {
      endpoint: {
        approveItem: {
          type: "mutation",
          args: [{ type: "param", name: "itemId", refName: "ID" }],
          returns: { refName: "String" },
        },
      },
    },
  },
);

const outcomeOf = async (send: () => unknown) => {
  try {
    return `sent ${String(await send())}`;
  } catch (error) {
    return `refused ${error instanceof Error ? error.message : String(error)}`;
  }
};

const LateScope = async () => {
  await Bun.sleep(50);
  return <p>{`late scope ${RenderScope.active()}`}</p>;
};

export const pages: PagesContext = {
  "./__root_layout.tsx": async () => ({
    default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
  }),
  "./approve/[itemId].tsx": async () => ({
    default: page()
      .param("itemId", ID)
      .render(async ({ itemId }) => <p>{await outcomeOf(() => client.handler.approveItem(itemId))}</p>),
  }),
  "./warm/[itemId].tsx": async () => ({
    default: page()
      .param("itemId", ID)
      .render(async ({ itemId }) => (
        <p>{await outcomeOf(() => client.handler.approveItem(itemId, { duringRender: true }))}</p>
      )),
  }),
  "./legacy/_index.tsx": async () => ({
    default: async () => {
      await Bun.sleep(10);
      return <p>{`legacy ${await outcomeOf(() => client.handler.approveItem("1234567890abcdef12345678"))}`}</p>;
    },
  }),
  "./streamed/_index.tsx": async () => ({
    default: page().render(() => (
      <Suspense fallback={<i>streaming</i>}>
        <LateScope />
      </Suspense>
    )),
  }),
};
