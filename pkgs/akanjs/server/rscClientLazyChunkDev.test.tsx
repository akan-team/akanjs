import "../test/registerDom";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act } from "react";

const htmlOf = (main: string) =>
  `["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(main)}}]}]]}]`;
const hydrated: unknown[][] = [];

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  process.env.AKAN_BUNDLE_COMMAND = "start";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL("http://localhost/home");
  const client = await import("react-dom/client");
  const { hydrateRoot } = client;
  mock.module("react-dom/client", () => ({
    ...client,
    hydrateRoot: (...args: Parameters<typeof hydrateRoot>) => {
      hydrated.push(args);
      return hydrateRoot(...args);
    },
  }));
  Object.assign(globalThis, {
    TransformStream,
    __webpack_require__: Object.assign(() => ({}), { u: () => "" }),
    __webpack_chunk_load__: () => Promise.resolve(),
    __RSC_CHUNKS__: [[1, `0:${htmlOf("/home")}\n`]],
    __RSC_CLOSED__: true,
  });
  document.documentElement.innerHTML = "<head></head><body><main>/home</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
});

describe("rscClient root under akan start", () => {
  test("hydrates with no error options, so React's development reporting stays", () => {
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]?.[0]).toBe(document);
    expect(hydrated[0]?.[2]).toBeUndefined();
    expect(document.querySelector("main")?.textContent).toBe("/home");
  });
});
