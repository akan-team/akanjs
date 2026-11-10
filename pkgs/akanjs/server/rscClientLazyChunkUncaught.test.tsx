import "../test/registerDom";
import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act, type ComponentType } from "react";
import { lazy } from "../webkit/lazy";

const origin = "http://localhost";
const htmlOf = (main: unknown) =>
  `["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(main)}}]}]]}]`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const linkError = new SyntaxError("Importing binding name 'AgentChatLog' is not found.");
const host = "/_akan/client/blank-host-a1.js";
const Lazy = lazy<{ default: ComponentType }>(() => Promise.reject(linkError));

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  process.env.AKAN_BUNDLE_COMMAND = "build";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/home`);
  Object.assign(globalThis, {
    TransformStream,
    __webpack_require__: Object.assign(() => ({ Host: () => <Lazy /> }), { u: () => "" }),
    __webpack_get_script_filename__: (chunkId: string) => chunkId,
    __webpack_chunk_load__: () => Promise.resolve(),
    __RSC_CHUNKS__: [[1, `0:${htmlOf("/home")}\n`]],
    __RSC_CLOSED__: true,
    fetch: async () =>
      new Response(`1:I${JSON.stringify([host, [host, host], "Host", 1])}\n0:${htmlOf(["$", "$L1", null, {}])}\n`, {
        headers: { "Content-Type": "text/x-component" },
      }),
  });
  document.documentElement.innerHTML = "<head></head><body><main>/home</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
});

describe("rscClient lazy chunk that fails to link with no error boundary above it", () => {
  test("reports the error as React would and reloads the page a navigation rendered", async () => {
    const reloadedAt: string[] = [];
    const spies = [
      spyOn(window.location, "reload").mockImplementation(() => {
        reloadedAt.push(window.location.href);
      }),
      spyOn(globalThis, "reportError").mockImplementation(() => undefined),
      spyOn(console, "warn").mockImplementation(() => undefined),
      spyOn(console, "error").mockImplementation(() => undefined),
    ];
    try {
      //? Inside `act`, React's development build throws an uncaught error from `act` instead of reporting it.
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
      await globalThis.__AKAN_RSC_NAVIGATE__?.("/blank");
      await sleep(50);

      expect(spies[1]?.mock.calls).toEqual([[linkError]]);
      expect(reloadedAt).toEqual([`${origin}/blank`]);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
