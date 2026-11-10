import "../test/registerDom";
import { afterEach, beforeAll, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act } from "react";

const origin = "http://localhost";
const encoder = new TextEncoder();
const documentOf = (text: string) =>
  `0:["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(text)}}]}]]}]\n`;
//? RSDW loads the chunk an `I` row names as the row arrives, so a page needs no element of it to fail.
const chunkRowOf = (row: number, chunk: string) => `${row}:I${JSON.stringify([chunk, [chunk, chunk], "Chat"])}\n`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const linkError = () =>
  new SyntaxError("The requested module 'akanjs/store' does not provide an export named 'AgentContext'");
const settleMs = 10_000;

type Step = string | Promise<unknown>;
const served = new Map<string, () => Step[]>();
const failChunk = new Map<string, (error: Error) => void>();

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
        failChunk.set(chunkId, reject);
      }),
    //? Left open: the document's own Suspense rows can arrive after the tab has navigated.
    __RSC_CHUNKS__: [[1, documentOf("/list")]],
    __RSC_CLOSED__: false,
    fetch: async (input: string | URL) => {
      const { pathname } = new URL(new URL(String(input)).searchParams.get("url") ?? "/", origin);
      const steps = served.get(pathname)?.() ?? [documentOf(pathname)];
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const step of steps) {
            if (typeof step === "string") controller.enqueue(encoder.encode(step));
            else await step;
          }
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

let assign: Mock<(href: string | URL) => void>;
let replace: Mock<(href: string | URL) => void>;
const settleTimers: (() => void)[] = [];
const restorers: (() => void)[] = [];

beforeEach(() => {
  sessionStorage.clear();
  process.env.AKAN_BUNDLE_COMMAND = "build";
  assign = spyOn(window.location, "assign").mockImplementation(() => undefined);
  replace = spyOn(window.location, "replace").mockImplementation(() => undefined);
  const setTimeoutOf = window.setTimeout.bind(window);
  //? Held, the settle timer stands in for a page a `beforeunload` handler kept.
  const timers = spyOn(window, "setTimeout").mockImplementation(((handler: () => void, ms?: number) => {
    if (ms !== settleMs) return setTimeoutOf(handler, ms);
    settleTimers.push(handler);
    return 0;
  }) as typeof window.setTimeout);
  const quiet = [spyOn(console, "warn"), spyOn(console, "error")].map((spy) => spy.mockImplementation(() => undefined));
  restorers.push(...[assign, replace, timers, ...quiet].map((spy) => () => spy.mockRestore()));
});

afterEach(() => {
  for (const settle of settleTimers.splice(0)) settle();
  for (const restore of restorers.splice(0)) restore();
  Reflect.deleteProperty(process.env, "AKAN_BUNDLE_COMMAND");
  served.clear();
});

const documentLoads = () => ({
  assigned: assign.mock.calls.map(([href]) => String(href)),
  replaced: replace.mock.calls.map(([href]) => String(href)),
});
const flush = async (ms = 5) => {
  await act(async () => {
    await sleep(ms);
  });
};
const chunkRequested = async (chunk: string) => {
  for (let i = 0; i < 50 && !failChunk.has(chunk); i += 1) await flush(2);
  expect(failChunk.has(chunk)).toBe(true);
};
const fail = async (chunk: string, error: Error) => {
  await chunkRequested(chunk);
  await act(async () => {
    failChunk.get(chunk)?.(error);
    await sleep(5);
  });
};
const navigate = async (href: string, options?: { shallow?: boolean; replace?: boolean }) => {
  await act(async () => {
    await globalThis.__AKAN_RSC_NAVIGATE__?.(href, options);
  });
};
const serveCommittedPage = (pathname: string, chunks: string[]) =>
  served.set(pathname, () => [
    documentOf(pathname),
    sleep(20),
    ...chunks.map((chunk, idx) => chunkRowOf(idx + 1, chunk)),
  ]);
const servePendingPage = (pathname: string, chunk: string) => {
  const held = { release: () => {} };
  served.set(pathname, () => [
    chunkRowOf(1, chunk),
    new Promise<void>((resolve) => {
      held.release = resolve;
    }),
    documentOf(pathname),
  ]);
  return held;
};
const startNavigation = (href: string, options?: { replace?: boolean }) => {
  let done: Promise<void> | undefined;
  return {
    started: act(async () => {
      done = globalThis.__AKAN_RSC_NAVIGATE__?.(href, options);
      await sleep(5);
    }),
    settled: async (held: { release: () => void }) => {
      await act(async () => {
        held.release();
        await done;
      });
    },
  };
};

describe("rscClient chunk that fails to load", () => {
  test("a pending navigation loads its target as a document, keeping its fragment, and replacing for a replace", async () => {
    const pushChunk = "/_akan/client/pending-push-a1.js";
    const pushHeld = servePendingPage("/pending-push", pushChunk);
    const push = startNavigation("/pending-push#reviews");
    await push.started;
    await fail(pushChunk, linkError());
    await push.settled(pushHeld);
    for (const settle of settleTimers.splice(0)) settle();

    const replaceChunk = "/_akan/client/pending-replace-a1.js";
    const replaceHeld = servePendingPage("/pending-replace", replaceChunk);
    const replacing = startNavigation("/pending-replace#top", { replace: true });
    await replacing.started;
    await fail(replaceChunk, linkError());
    await replacing.settled(replaceHeld);

    expect(documentLoads()).toEqual({
      assigned: [`${origin}/pending-push#reviews`],
      replaced: [`${origin}/pending-replace#top`],
    });
  });

  test("a committed page whose chunk fails to link loads again as a document, once per chunk in a tab", async () => {
    const chunk = "/_akan/client/agent-a1.js";
    serveCommittedPage("/agent", [chunk]);
    await navigate("/agent#chat");
    await fail(chunk, linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [`${origin}/agent#chat`] });
    expect(JSON.parse(sessionStorage.getItem("akan.rsc.chunkReloads") ?? "[]")).toEqual([chunk]);
  });

  test("a chunk that already reloaded this tab shows its error instead of reloading again", async () => {
    const chunk = "/_akan/client/again-a1.js";
    sessionStorage.setItem("akan.rsc.chunkReloads", JSON.stringify([chunk]));
    serveCommittedPage("/again", [chunk]);
    await navigate("/again");
    await fail(chunk, linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [] });
  });

  test("offline, a failed fetch or a chunk's own error leaves the committed page in place", async () => {
    const [fetchChunk, evalChunk, offlineChunk] = ["fetch", "eval", "offline"].map(
      (kind) => `/_akan/client/${kind}-a1.js`,
    );
    serveCommittedPage("/quiet", [fetchChunk, evalChunk, offlineChunk]);
    await navigate("/quiet");
    await fail(fetchChunk, new TypeError("Failed to fetch dynamically imported module: /_akan/client/fetch-a1.js"));
    await fail(evalChunk, new TypeError("Cannot read properties of undefined (reading 'map')"));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      await fail(offlineChunk, linkError());
    } finally {
      Reflect.deleteProperty(navigator, "onLine");
    }
    expect(navigator.onLine).toBe(true);

    expect(documentLoads()).toEqual({ assigned: [], replaced: [] });
  });

  test("an overtaken navigation's chunk leaves the page that overtook it in place", async () => {
    const chunk = "/_akan/client/overtaken-a1.js";
    const held = servePendingPage("/overtaken", chunk);
    const overtaken = startNavigation("/overtaken");
    await overtaken.started;
    await chunkRequested(chunk);
    await navigate("/winner");
    await fail(chunk, linkError());
    await overtaken.settled(held);

    expect(window.location.pathname).toBe("/winner");
    expect(documentLoads()).toEqual({ assigned: [], replaced: [] });
  });

  test("a replaced response's late chunk leaves the refresh that replaced it in place", async () => {
    const chunk = "/_akan/client/replaced-a1.js";
    const held = { release: () => {} };
    const responses: Step[][] = [
      [
        documentOf("/replaced"),
        new Promise<void>((resolve) => {
          held.release = resolve;
        }),
        chunkRowOf(1, chunk),
      ],
    ];
    served.set("/replaced", () => responses.shift() ?? [documentOf("/replaced")]);
    await navigate("/replaced");
    await act(async () => {
      await globalThis.__AKAN_RSC_REFRESH__?.();
    });
    held.release();
    await fail(chunk, linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [] });
  });

  test("the document's own late chunk leaves it in place after a shallow update or a refresh", async () => {
    await navigate("/list?tab=2", { shallow: true, replace: true });
    await act(async () => {
      globalThis.__RSC_PUSH__?.(1, chunkRowOf(5, "/_akan/client/own-after-shallow-a1.js"));
      await sleep(5);
    });
    await fail("/_akan/client/own-after-shallow-a1.js", linkError());
    await act(async () => {
      await globalThis.__AKAN_RSC_REFRESH__?.();
    });
    await act(async () => {
      globalThis.__RSC_PUSH__?.(1, chunkRowOf(6, "/_akan/client/own-after-refresh-a1.js"));
      await sleep(5);
    });
    await fail("/_akan/client/own-after-refresh-a1.js", linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [] });
  });

  test("a development bundle keeps the failure in the page", async () => {
    process.env.AKAN_BUNDLE_COMMAND = "start";
    const chunk = "/_akan/client/dev-a1.js";
    serveCommittedPage("/dev", [chunk]);
    await navigate("/dev");
    await fail(chunk, linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [] });
  });

  test("a page a `beforeunload` kept navigates on a later failure once the first has settled", async () => {
    const [first, held, later] = ["first", "held", "later"].map((name) => `/_akan/client/${name}-a1.js`);
    serveCommittedPage("/first", [first]);
    await navigate("/first");
    await fail(first, linkError());
    serveCommittedPage("/held", [held]);
    await navigate("/held");
    await fail(held, linkError());
    expect(documentLoads().replaced).toEqual([`${origin}/first`]);

    for (const settle of settleTimers.splice(0)) settle();
    serveCommittedPage("/later", [later]);
    await navigate("/later");
    await fail(later, linkError());

    expect(documentLoads().replaced).toEqual([`${origin}/first`, `${origin}/later`]);
  });
});
