import { beforeAll, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { setTestEnv } from "../testHelpers.fixture";

let SSR: typeof import("./SSR").SSR;
let usePathCtx: typeof import("akanjs/client").usePathCtx;
let defaultPageState: typeof import("akanjs/client").defaultPageState;
let requestStorage: typeof import("akanjs/fetch").requestStorage;

beforeAll(async () => {
  setTestEnv("ssrtest");
  ({ SSR } = await import("./SSR"));
  ({ usePathCtx, defaultPageState } = await import("akanjs/client"));
  ({ requestStorage } = await import("akanjs/fetch"));
});

const Probe = () => {
  const { location, followsRouter } = usePathCtx();
  return (
    <p id="probe">{JSON.stringify({ href: location.href, searchParams: location.searchParams, followsRouter })}</p>
  );
};
const shownFor = async (url: string, node: ReactNode) => {
  if (!requestStorage) throw new Error("request storage is unavailable");
  const html = await requestStorage.run(new Request(url), async () =>
    new Response(await renderToReadableStream(node)).text(),
  );
  const text = html.match(/<p id="probe">(.*?)<\/p>/)?.[1] ?? "{}";
  return JSON.parse(text.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
};

describe("SSR.Wrapper", () => {
  test("gives the page the request's query, which the path the locale proxy hands it leaves out", async () => {
    const shown = await shownFor(
      "http://localhost/en/admin?topMenu=account&tag=a&tag=b",
      <SSR.Wrapper appName="ssrtest" lang="en" path="/admin">
        <Probe />
      </SSR.Wrapper>,
    );

    expect(shown).toEqual({
      href: "/en/admin?topMenu=account&tag=a&tag=b",
      searchParams: { topMenu: "account", tag: ["a", "b"] },
      followsRouter: true,
    });
  });

  test("an overlaid side's chrome lets the page show and be touched through it", async () => {
    const htmlFor = async (overlay?: { top: boolean; bottom: boolean }) => {
      if (!requestStorage) throw new Error("request storage is unavailable");
      const pageState = { ...defaultPageState, topInset: 48, bottomInset: 64, ...(overlay ? { overlay } : {}) };
      return await requestStorage.run(new Request("http://localhost/en/home"), async () =>
        new Response(
          await renderToReadableStream(
            <SSR.Wrapper appName="ssrtest" lang="en" path="/home" pageState={pageState}>
              <Probe />
            </SSR.Wrapper>,
          ),
        ).text(),
      );
    };
    const classOf = (html: string, id: string) => html.match(new RegExp(`id="${id}" class="([^"]*)"`))?.[1] ?? "";

    const overlaid = await htmlFor({ top: true, bottom: true });
    expect(classOf(overlaid, "topInsetContainer")).toContain("bg-transparent");
    expect(classOf(overlaid, "topSafeArea")).toContain("pointer-events-none");
    expect(classOf(overlaid, "bottomSafeArea")).toContain("pointer-events-none");
    expect(overlaid).toContain("--akan-page-padding-bottom:0px");

    const reserved = await htmlFor();
    expect(classOf(reserved, "topInsetContainer")).not.toContain("bg-transparent");
    expect(classOf(reserved, "bottomSafeArea")).not.toContain("pointer-events-none");
  });
});
