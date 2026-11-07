import { beforeAll, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { setTestEnv } from "../testHelpers.fixture";

let SSR: typeof import("./SSR").SSR;
let usePathCtx: typeof import("akanjs/client").usePathCtx;
let requestStorage: typeof import("akanjs/fetch").requestStorage;

beforeAll(async () => {
  setTestEnv("ssrtest");
  ({ SSR } = await import("./SSR"));
  ({ usePathCtx } = await import("akanjs/client"));
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
});
