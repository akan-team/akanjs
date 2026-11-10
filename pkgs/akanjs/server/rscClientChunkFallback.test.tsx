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
const outlinedChunkRowsOf = (pathRow: string, importRow: string, chunk: string) => {
  const reference = `$${pathRow}`;
  return `${pathRow}:${JSON.stringify(chunk)}\n${importRow}:I${JSON.stringify([reference, [reference, reference], "Chat"])}\n`;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const linkError = () =>
  new SyntaxError("The requested module 'akanjs/store' does not provide an export named 'AgentContext'");

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
let reloadedAt: string[] = [];
const restorers: (() => void)[] = [];
const restoreFromBackForwardCache = () =>
  window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));

beforeEach(() => {
  restoreFromBackForwardCache();
  sessionStorage.clear();
  process.env.AKAN_BUNDLE_COMMAND = "build";
  assign = spyOn(window.location, "assign").mockImplementation(() => undefined);
  replace = spyOn(window.location, "replace").mockImplementation(() => undefined);
  reloadedAt = [];
  const reload = spyOn(window.location, "reload").mockImplementation(() => {
    reloadedAt.push(window.location.href);
  });
  const quiet = [spyOn(console, "warn"), spyOn(console, "error")].map((spy) => spy.mockImplementation(() => undefined));
  restorers.push(...[assign, replace, reload, ...quiet].map((spy) => () => spy.mockRestore()));
});

afterEach(() => {
  for (const restore of restorers.splice(0)) restore();
  Reflect.deleteProperty(process.env, "AKAN_BUNDLE_COMMAND");
  served.clear();
});

const documentLoads = () => ({
  assigned: assign.mock.calls.map(([href]) => String(href)),
  replaced: replace.mock.calls.map(([href]) => String(href)),
  reloaded: [...reloadedAt],
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
const refresh = async () => {
  await act(async () => {
    await globalThis.__AKAN_RSC_REFRESH__?.();
  });
};
const reloadedChunks = () => JSON.parse(sessionStorage.getItem("akan.rsc.chunkReloads") ?? "[]") as string[];
const heldStep = () => {
  const held = { release: () => {}, step: Promise.resolve() };
  held.step = new Promise<void>((resolve) => {
    held.release = resolve;
  });
  return held;
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

    const replaceChunk = "/_akan/client/pending-replace-a1.js";
    const replaceHeld = servePendingPage("/pending-replace", replaceChunk);
    const replacing = startNavigation("/pending-replace#top", { replace: true });
    await replacing.started;
    await fail(replaceChunk, linkError());
    await replacing.settled(replaceHeld);

    expect(documentLoads()).toEqual({
      assigned: [`${origin}/pending-push#reviews`],
      replaced: [`${origin}/pending-replace#top`],
      reloaded: [],
    });
  });

  test("a back or forward move to a fragment whose page fails to link before it commits reloads that address", async () => {
    const chunk = "/_akan/client/history-a1.js";
    const held = servePendingPage("/history", chunk);
    await act(async () => {
      window.history.pushState(null, "", "/history#reviews");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      await sleep(5);
    });
    await fail(chunk, linkError());
    await act(async () => {
      held.release();
      await sleep(5);
    });

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [`${origin}/history#reviews`] });
  });

  test("a committed page whose chunk fails to link reloads the address it now shows, once per chunk in a tab", async () => {
    const chunk = "/_akan/client/agent-a1.js";
    served.set("/agent", () => [documentOf("/agent"), sleep(20), outlinedChunkRowsOf("1a", "1b", chunk)]);
    await navigate("/agent#chat");
    await navigate("/agent?tab=2#chat", { shallow: true, replace: true });
    await fail(chunk, linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [`${origin}/agent?tab=2#chat`] });
    expect(reloadedChunks()).toEqual([chunk]);
  });

  test("a refresh of the page on screen reloads it for a link error only, as its committed page would", async () => {
    const [fetchChunk, linkChunk] = ["refresh-fetch", "refresh-link"].map((name) => `/_akan/client/${name}-a1.js`);
    const held = heldStep();
    const responses: Step[][] = [
      [documentOf("/refreshing")],
      [chunkRowOf(1, fetchChunk), chunkRowOf(2, linkChunk), held.step, documentOf("/refreshing")],
    ];
    served.set("/refreshing", () => responses.shift() ?? [documentOf("/refreshing")]);
    await navigate("/refreshing");
    let refreshed: Promise<void> | undefined;
    await act(async () => {
      refreshed = globalThis.__AKAN_RSC_REFRESH__?.();
      await sleep(5);
    });
    await fail(
      fetchChunk,
      new TypeError("Failed to fetch dynamically imported module: /_akan/client/refresh-fetch-a1.js"),
    );
    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
    await fail(linkChunk, linkError());
    await act(async () => {
      held.release();
      await refreshed;
    });

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [`${origin}/refreshing`] });
  });

  test("a refresh after a shallow query change still leaves the page in place for a failed fetch", async () => {
    const [fetchChunk, linkChunk] = ["shallow-fetch", "shallow-link"].map((name) => `/_akan/client/${name}-a1.js`);
    const held = heldStep();
    const responses: Step[][] = [
      [documentOf("/tabbed")],
      [chunkRowOf(1, fetchChunk), chunkRowOf(2, linkChunk), held.step, documentOf("/tabbed")],
    ];
    served.set("/tabbed", () => responses.shift() ?? [documentOf("/tabbed")]);
    await navigate("/tabbed");
    await navigate("/tabbed?tab=2", { shallow: true });
    let refreshed: Promise<void> | undefined;
    await act(async () => {
      refreshed = globalThis.__AKAN_RSC_REFRESH__?.();
      await sleep(5);
    });
    await fail(
      fetchChunk,
      new TypeError("Failed to fetch dynamically imported module: /_akan/client/shallow-fetch-a1.js"),
    );
    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
    await fail(linkChunk, linkError());
    await act(async () => {
      held.release();
      await refreshed;
    });

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [`${origin}/tabbed?tab=2`] });
  });

  test("a chunk a page's text only mentions stays the document's own", async () => {
    const chunk = "/_akan/client/mentioned-a1.js";
    served.set("/mentions", () => [documentOf(chunk), `2a:${JSON.stringify(chunk)}\n`]);
    await navigate("/mentions");
    await act(async () => {
      globalThis.__RSC_PUSH__?.(1, chunkRowOf(7, chunk));
      await sleep(5);
    });
    await fail(chunk, linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
  });

  test("a chunk that already reloaded this tab shows its error instead of reloading again", async () => {
    const chunk = "/_akan/client/again-a1.js";
    sessionStorage.setItem("akan.rsc.chunkReloads", JSON.stringify([chunk]));
    serveCommittedPage("/again", [chunk]);
    await navigate("/again");
    await fail(chunk, linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
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

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
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
    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
  });

  test("a replaced response's late chunk leaves the refresh that replaced it in place", async () => {
    const chunk = "/_akan/client/replaced-a1.js";
    const held = heldStep();
    const responses: Step[][] = [[documentOf("/replaced"), held.step, chunkRowOf(1, chunk)]];
    served.set("/replaced", () => responses.shift() ?? [documentOf("/replaced")]);
    await navigate("/replaced");
    await refresh();
    held.release();
    await fail(chunk, linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
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

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
  });

  test("a development bundle keeps the failure in the page", async () => {
    process.env.AKAN_BUNDLE_COMMAND = "start";
    const chunk = "/_akan/client/dev-a1.js";
    serveCommittedPage("/dev", [chunk]);
    await navigate("/dev");
    await fail(chunk, linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
  });

  test("a refresh during a fallback's document load leaves it alone, and the page's next navigation may fall back", async () => {
    const [first, during, later] = ["first", "during", "later"].map((name) => `/_akan/client/${name}-a1.js`);
    const responses: Step[][] = [
      [documentOf("/first"), sleep(20), chunkRowOf(1, first)],
      [documentOf("/first"), sleep(20), chunkRowOf(1, during)],
    ];
    served.set("/first", () => responses.shift() ?? [documentOf("/first")]);
    await navigate("/first");
    await fail(first, linkError());
    await refresh();
    await fail(during, linkError());
    expect(documentLoads().reloaded).toEqual([`${origin}/first`]);
    expect(reloadedChunks()).toEqual([first]);

    serveCommittedPage("/later", [later]);
    await navigate("/later");
    await fail(later, linkError());

    expect(documentLoads().reloaded).toEqual([`${origin}/first`, `${origin}/later`]);
    expect(reloadedChunks()).toEqual([first, later]);
  });

  test("a page restored from the back-forward cache may fall back again", async () => {
    const [left, restored] = ["left", "restored"].map((name) => `/_akan/client/${name}-a1.js`);
    const responses: Step[][] = [
      [documentOf("/left"), sleep(20), chunkRowOf(1, left)],
      [documentOf("/left"), sleep(20), chunkRowOf(1, restored)],
    ];
    served.set("/left", () => responses.shift() ?? [documentOf("/left")]);
    await navigate("/left");
    await fail(left, linkError());
    restoreFromBackForwardCache();
    await refresh();
    await fail(restored, linkError());

    expect(documentLoads().reloaded).toEqual([`${origin}/left`, `${origin}/left`]);
  });
});
