import "../test/registerDom";
import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act } from "react";

const origin = "http://localhost";
const documentOf = (text: string) =>
  `0:["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(text)}}]}]]}]\n`;
//? RSDW loads the chunk an `I` row names as the row arrives, so the page needs no element of it to fail.
const chunkRowOf = (chunk: string) => `1:I${JSON.stringify([chunk, [chunk, chunk], "Chat"])}\n`;
const chunkOf = (pathname: string) => `/_akan/client${pathname}-a1.js`;
const unlinkable = (chunk: string) =>
  new SyntaxError(`The requested module 'akanjs/store' does not provide an export named 'AgentContext' (${chunk})`);
const failLater = new Map<string, (error: Error) => void>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/list`);
  Object.assign(globalThis, {
    TransformStream,
    __webpack_require__: Object.assign(() => ({ Chat: () => null }), { u: () => "" }),
    __webpack_chunk_load__: (chunkId: string) =>
      new Promise<void>((_resolve, reject) => {
        failLater.set(chunkId, reject);
      }),
    __RSC_CHUNKS__: [[1, `${documentOf("/list")}${chunkRowOf(chunkOf("/list"))}`]],
    __RSC_CLOSED__: true,
    //? The page's row first and its chunk's row once the navigation settled, the order a streamed page arrives in.
    fetch: async (input: string | URL) => {
      const { pathname } = new URL(new URL(String(input)).searchParams.get("url") ?? "/", origin);
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(documentOf(pathname)));
          await sleep(20);
          controller.enqueue(encoder.encode(chunkRowOf(chunkOf(pathname))));
          controller.close();
        },
      });
      return new Response(body, { headers: { "Content-Type": "text/x-component" } });
    },
  });
  document.documentElement.innerHTML = "<head></head><body><main>/list</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
});

const documentLoadsWhen = async (nodeEnv: string, run: () => Promise<void>) => {
  const assign = spyOn(window.location, "assign").mockImplementation(() => undefined);
  const replace = spyOn(window.location, "replace").mockImplementation(() => undefined);
  const silenced = [spyOn(console, "warn"), spyOn(console, "error")].map((spy) =>
    spy.mockImplementation(() => undefined),
  );
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    await run();
    return {
      assigned: assign.mock.calls.map(([href]) => String(href)),
      replaced: replace.mock.calls.map(([href]) => String(href)),
    };
  } finally {
    process.env.NODE_ENV = previous;
    for (const spy of [assign, replace, ...silenced]) spy.mockRestore();
  }
};

const navigateThenFailChunk = (pathname: string) => async () => {
  await act(async () => {
    await globalThis.__AKAN_RSC_NAVIGATE__?.(pathname);
  });
  expect(window.location.pathname).toBe(pathname);
  await act(async () => {
    await sleep(40);
  });
  expect(failLater.has(chunkOf(pathname))).toBe(true);
  await act(async () => {
    failLater.get(chunkOf(pathname))?.(unlinkable(chunkOf(pathname)));
    await sleep(5);
  });
};

describe("rscClient route chunk that fails to link", () => {
  test("a chunk the document asked for before any navigation never reloads it", async () => {
    const failed = await documentLoadsWhen("production", async () => {
      await act(async () => {
        failLater.get(chunkOf("/list"))?.(unlinkable(chunkOf("/list")));
        await sleep(5);
      });
    });

    expect(failed).toEqual({ assigned: [], replaced: [] });
  });

  test("a development build keeps the failure in the page", async () => {
    expect(await documentLoadsWhen("development", navigateThenFailChunk("/dev"))).toEqual({
      assigned: [],
      replaced: [],
    });
  });

  test("a chunk of a page a navigation committed loads that page as a document in its place", async () => {
    expect(await documentLoadsWhen("production", navigateThenFailChunk("/agent"))).toEqual({
      assigned: [],
      replaced: [`${origin}/agent`],
    });
  });
});
