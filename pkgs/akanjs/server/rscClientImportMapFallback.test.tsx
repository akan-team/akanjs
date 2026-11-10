import "../test/registerDom";
import { beforeAll, expect, spyOn, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act } from "react";
import { AKAN_RSC_IMPORT_MAP_HEADER } from "./routeState";

const origin = "http://localhost";
const rowOf = (text: string) =>
  `0:["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(text)}}]}]]}]\n`;
const sentImportMaps: (string | null)[] = [];

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/list`);
  Object.assign(globalThis, {
    TransformStream,
    __webpack_require__: Object.assign(() => ({}), { u: () => "" }),
    __webpack_chunk_load__: async () => undefined,
    __RSC_CHUNKS__: [[1, rowOf("/list")]],
    __RSC_CLOSED__: true,
    __AKAN_IMPORT_MAP_KEY__: "build-a",
    fetch: async (_input: string | URL, init?: RequestInit) => {
      sentImportMaps.push(new Headers(init?.headers).get(AKAN_RSC_IMPORT_MAP_HEADER));
      return new Response("Conflict", { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    },
  });
  document.documentElement.innerHTML = "<head></head><body><main>/list</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
});

test("a navigation the server refuses for another build's import map loads its target as a document", async () => {
  const assign = spyOn(window.location, "assign").mockImplementation(() => undefined);
  const warn = spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    await act(async () => {
      await globalThis.__AKAN_RSC_NAVIGATE__?.("/next");
    });

    expect(sentImportMaps).toEqual(["build-a"]);
    expect(assign.mock.calls).toEqual([[`${origin}/next`]]);
    expect(String(warn.mock.calls[0]?.[0])).toContain("409");
    expect(document.querySelector("main")?.textContent).toBe("/list");
  } finally {
    assign.mockRestore();
    warn.mockRestore();
  }
});
