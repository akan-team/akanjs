import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act } from "react";

const origin = "http://localhost";
//? A Flight row for the whole document, so the root that hydrates `document` gets a tree it can own.
const rowOf = (text: string) =>
  `0:["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(text)}}]}]]}]\n`;
const responseOf = (text: string) => new Response(rowOf(text), { headers: { "Content-Type": "text/x-component" } });
const shown = () => document.querySelector("main")?.textContent;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (done: () => boolean) => {
  for (let i = 0; i < 100 && !done(); i += 1)
    await act(async () => {
      await sleep(5);
    });
};
const navigate = async (href: string, options?: { shallow?: boolean; replace?: boolean }) => {
  await act(async () => {
    await globalThis.__AKAN_RSC_NAVIGATE__?.(href, options);
  });
};
const refresh = async () => {
  await act(async () => {
    await globalThis.__AKAN_RSC_REFRESH__?.();
  });
};
const back = async (expected: string) => {
  await act(async () => window.history.back());
  await waitFor(() => shown() === expected);
};

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/list`);
  Object.assign(globalThis, {
    //? happy-dom swaps in a TransformStream of its own, which the runtime's ReadableStream refuses to pipe through.
    TransformStream,
    __webpack_require__: Object.assign(() => ({}), { u: () => "" }),
    __webpack_chunk_load__: async () => undefined,
    __RSC_CHUNKS__: [[1, rowOf("/list")]],
    __RSC_CLOSED__: true,
    fetch: async (input: string | URL) => {
      const target = new URL(new URL(String(input)).searchParams.get("url") ?? "/", origin);
      return responseOf(`${target.pathname}${target.search}`);
    },
  });
  document.documentElement.innerHTML = "<head></head><body><main>/list</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
  await waitFor(() => !!globalThis.__AKAN_RSC_NAVIGATE__);
});

describe("rscClient history", () => {
  test("a shallow entry whose render a same-path push replaced renders again when history returns to it", async () => {
    await navigate("/list?peek=a", { shallow: true });
    expect(shown()).toBe("/list");
    await navigate("/list?page=2");
    expect(shown()).toBe("/list?page=2");

    await back("/list?peek=a");

    expect(window.location.search).toBe("?peek=a");
    expect(shown()).toBe("/list?peek=a");
  });

  test("a refresh on a shallow entry renders for its href, so the entry before it renders again on back", async () => {
    await navigate("/feed");
    await navigate("/feed?peek=b", { shallow: true });
    expect(shown()).toBe("/feed");
    await refresh();
    expect(shown()).toBe("/feed?peek=b");

    await back("/feed");

    expect(window.location.search).toBe("");
    expect(shown()).toBe("/feed");
  });
});
