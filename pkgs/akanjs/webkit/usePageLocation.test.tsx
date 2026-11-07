import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import type { Location } from "akanjs/client";
import { act } from "react";
import { mountAsync, setTestEnv } from "../ui/testHelpers.fixture";

let ClientPathWrapper: typeof import("../ui/System/Client").ClientPathWrapper;
let usePageLocation: typeof import("./usePageLocation").usePageLocation;
let setState: (state: Record<string, unknown>) => void;

beforeAll(async () => {
  setTestEnv("pagelocationtest");
  const { st } = await import("akanjs/store");
  setState = (state) => (st as unknown as { set: (state: Record<string, unknown>) => void }).set(state);
  ({ ClientPathWrapper } = await import("../ui/System/Client"));
  ({ usePageLocation } = await import("./usePageLocation"));
});

const Probe = () => {
  const { pathname, params, searchParams } = usePageLocation();
  return <p>{JSON.stringify({ pathname, params, searchParams })}</p>;
};
const shown = (container: HTMLElement) => JSON.parse(container.textContent ?? "{}");

describe("usePageLocation", () => {
  test("follows the router on an SSR page, keeping the route params its wrapper was given", async () => {
    setState({ pathname: "/en/admin", searchParams: { topMenu: "account" } });
    const { container, unmount } = await mountAsync(
      <ClientPathWrapper
        initialPathname="/en/admin"
        initialPath="/admin"
        initialParams={{ lang: "en" }}
        initialSearch="?topMenu=account"
      >
        <Probe />
      </ClientPathWrapper>,
    );

    expect(shown(container)).toEqual({
      pathname: "/en/admin",
      params: { lang: "en" },
      searchParams: { topMenu: "account" },
    });
    await act(async () => {
      setState({ searchParams: { topMenu: "account", action: "view", modelId: "a" } });
    });
    expect(shown(container).searchParams).toEqual({ topMenu: "account", action: "view", modelId: "a" });
    unmount();
  });

  test("reads a CSR page's own location, not the one on screen", async () => {
    setState({ pathname: "/en/other", searchParams: { tab: "on-screen" } });
    const location = {
      href: "http://localhost/en/admin?tab=own",
      pathname: "/en/admin",
      search: "?tab=own",
      params: { lang: "en" },
      searchParams: { tab: "own" },
      hash: "",
      pathRoute: {
        path: "/admin",
        pathSegments: ["admin"],
        renderPage: { render: () => null },
        pageState: {},
        renderRootLayouts: [],
        renderLayouts: [],
      },
    } as unknown as Location;
    const { container, unmount } = await mountAsync(
      <ClientPathWrapper location={location} pageType="prev">
        <Probe />
      </ClientPathWrapper>,
    );

    expect(shown(container)).toEqual({
      pathname: "/en/admin",
      params: { lang: "en" },
      searchParams: { tab: "own" },
    });
    unmount();
    setState({ pathname: "/", searchParams: {} });
  });
});
