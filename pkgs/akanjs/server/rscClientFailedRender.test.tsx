import "../test/registerDom";
import { beforeAll, describe, expect, spyOn, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act } from "react";
import * as streamBoundaryModule from "../ui/Load/StreamBoundary";
import * as routeLevelBoundaryModule from "../webkit/RouteLevelBoundary";

const origin = "http://localhost";
const htmlOf = (main: unknown) =>
  `["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(main)}}]}]]}]`;
const errorRowOf = (id: number, digest: string) =>
  `${id}:E${JSON.stringify({ digest, name: "Error", message: "level broke", stack: [], env: "Server", owner: null })}\n`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const shown = () => document.querySelector("main")?.textContent;
const noticeShown = () => !!document.querySelector('main [role="alert"]');
const waitFor = async (done: () => boolean) => {
  for (let i = 0; i < 100 && !done(); i += 1)
    await act(async () => {
      await sleep(5);
    });
};
const navigate = async (href: string) => {
  await act(async () => {
    await globalThis.__AKAN_RSC_NAVIGATE__?.(href);
  });
};
const back = async (expected: () => boolean) => {
  await act(async () => window.history.back());
  await waitFor(expected);
};
const headers = { "Content-Type": "text/x-component" };
const pageOf = (text: string) => new Response(`0:${htmlOf(text)}\n`, { headers });
const boundaries = {
  RouteLevelBoundary: { id: "route-level", props: {} },
  StreamBoundary: { id: "load", props: { resetKey: "level" } },
} as const;
const failingLevelRows = (boundary: keyof typeof boundaries) => {
  const { id, props } = boundaries[boundary];
  return `1:I${JSON.stringify([id, [], boundary])}\n0:${htmlOf(["$", "$L1", null, { ...props, children: "$L2" }])}\n`;
};
const failingLevelOf = (boundary: keyof typeof boundaries) =>
  new Response(`${errorRowOf(2, "3f2a9c1d")}${failingLevelRows(boundary)}`, { headers });
const failingLateOf = (boundary: keyof typeof boundaries, release: Promise<void>) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${failingLevelRows(boundary)}2:"level ok"\n`));
      await release;
      controller.enqueue(encoder.encode(errorRowOf(3, "9c1d3f2a")));
      controller.close();
    },
  });
  return new Response(body, { headers });
};
const served = new Map<string, () => Response>();
const fetched: string[] = [];
const fetchCountOf = (pathname: string) => fetched.filter((requested) => requested === pathname).length;
const failedOnce = (pathname: string, failing: () => Response) =>
  served.set(pathname, () => (fetchCountOf(pathname) === 1 ? failing() : pageOf(`${pathname} again`)));

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/home`);
  const modules: Record<string, unknown> = { "route-level": routeLevelBoundaryModule, load: streamBoundaryModule };
  Object.assign(globalThis, {
    TransformStream,
    __webpack_require__: Object.assign((id: string) => modules[id] ?? {}, { u: () => "" }),
    __webpack_chunk_load__: async () => undefined,
    //? An error row no element reads: a level that failed would need the server's markup to hydrate against.
    __RSC_CHUNKS__: [[1, `0:${htmlOf("/home")}\n${errorRowOf(9, "1d3f2a9c")}`]],
    __RSC_CLOSED__: true,
    fetch: async (input: string | URL) => {
      const pathname = new URL(new URL(String(input)).searchParams.get("url") ?? "/", origin).pathname;
      fetched.push(pathname);
      return served.get(pathname)?.() ?? pageOf(pathname);
    },
  });
  document.documentElement.innerHTML = "<head></head><body><main>/home</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
  await waitFor(() => !!globalThis.__AKAN_RSC_NAVIGATE__);
});

describe("rscClient page whose render streamed an error", () => {
  test("the document's own page is asked for again on return, not replayed", async () => {
    await navigate("/lobby");

    await back(() => shown() === "/home");

    expect(fetchCountOf("/home")).toBe(1);
    expect(shown()).toBe("/home");
  });

  test.each(["RouteLevelBoundary", "StreamBoundary"] as const)(
    "a level a %s caught, failed before the page committed, is asked for again on return, not replayed",
    async (boundary) => {
      const quiet = spyOn(console, "error").mockImplementation(() => undefined);
      const page = `/broken/${boundary}`;
      try {
        failedOnce(page, () => failingLevelOf(boundary));
        await navigate(page);
        expect(noticeShown()).toBe(true);
        await navigate("/away");

        await back(() => !noticeShown() && shown() !== "/away");

        expect(fetchCountOf(page)).toBe(2);
        expect(shown()).toBe(`${page} again`);
        await navigate("/away");
        await navigate(page);
        expect(fetchCountOf(page)).toBe(2);
      } finally {
        quiet.mockRestore();
      }
    },
  );

  test("an error streamed after the page committed still keeps it from being replayed", async () => {
    const quiet = spyOn(console, "error").mockImplementation(() => undefined);
    let release = () => {};
    const released = new Promise<void>((resolve) => (release = resolve));
    try {
      failedOnce("/late", () => failingLateOf("RouteLevelBoundary", released));
      await navigate("/late");
      expect(shown()).toBe("level ok");
      release();
      await act(async () => {
        await sleep(10);
      });
      await navigate("/away");

      await navigate("/late");

      expect(fetchCountOf("/late")).toBe(2);
      expect(shown()).toBe("/late again");
    } finally {
      quiet.mockRestore();
    }
  });
});
