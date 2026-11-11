import "../test/registerDom";
import { afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act, Component, type ComponentType, type ReactNode } from "react";
import { lazy } from "../webkit/lazy";

const origin = "http://localhost";
const encoder = new TextEncoder();
const htmlOf = (main: unknown) =>
  `["$","html",null,{"children":[["$","head","h",{}],["$","body","b",{"children":["$","main",null,{"children":${JSON.stringify(main)}}]}]]}]`;
const importRowOf = (row: number, chunk: string, name: string) =>
  `${row}:I${JSON.stringify([chunk, [chunk, chunk], name, 1])}\n`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const chunkUrl = (name: string) => `${origin}/_akan/client/chunks/${name}.js`;
const chromiumGone = (url: string) => new TypeError(`Failed to fetch dynamically imported module: ${url}`);
const firefoxGone = (url: string) => new TypeError(`error loading dynamically imported module: ${url}`);

class Boundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  override state: { failed: boolean } = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Probe = number | "unanswered" | Promise<number>;
const probeAnswers = new Map<string, Probe>();
const probes: { url: string; method?: string; cache?: RequestCache }[] = [];
const served = new Map<string, () => string[]>();
const modules = new Map<string, Record<string, unknown>>([["/_akan/client/gone-boundary-a1.js", { Boundary }]]);
const failingChunks = new Map<string, Error>();

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  process.env.AKAN_BUNDLE_COMMAND = "build";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/home`);
  Object.assign(globalThis, {
    TransformStream,
    __webpack_require__: Object.assign((id: string) => modules.get(id) ?? {}, { u: () => "" }),
    __webpack_get_script_filename__: (chunkId: string) => chunkId,
    __webpack_chunk_load__: (chunkId: string) => {
      const failure = failingChunks.get(chunkId);
      return failure ? Promise.reject(failure) : Promise.resolve();
    },
    __RSC_CHUNKS__: [[1, `0:${htmlOf("/home")}\n`]],
    __RSC_CLOSED__: true,
    fetch: async (input: string | URL, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        const url = String(input);
        probes.push({ url, method: init.method, cache: init.cache });
        const answer = await (probeAnswers.get(url) ?? 200);
        if (answer === "unanswered") throw new TypeError("Failed to fetch");
        return new Response(null, { status: answer });
      }
      const { pathname } = new URL(new URL(String(input)).searchParams.get("url") ?? "/", origin);
      const rows = served.get(pathname)?.() ?? [`0:${htmlOf(pathname)}\n`];
      return new Response(new Blob(rows.map((row) => encoder.encode(row))).stream(), {
        headers: { "Content-Type": "text/x-component" },
      });
    },
  });
  document.documentElement.innerHTML = "<head></head><body><main>/home</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
});

let reloadedAt: string[] = [];
const restorers: (() => void)[] = [];

beforeEach(() => {
  sessionStorage.clear();
  process.env.AKAN_BUNDLE_COMMAND = "build";
  reloadedAt = [];
  const spies = [
    spyOn(window.location, "reload").mockImplementation(() => {
      reloadedAt.push(window.location.href);
    }),
    spyOn(console, "error").mockImplementation(() => undefined),
    spyOn(console, "warn").mockImplementation(() => undefined),
  ];
  restorers.push(...spies.map((spy) => () => spy.mockRestore()));
});

afterEach(() => {
  for (const restore of restorers.splice(0)) restore();
  probes.splice(0);
  probeAnswers.clear();
  served.clear();
  failingChunks.clear();
});

const navigate = async (href: string) => {
  await act(async () => {
    await globalThis.__AKAN_RSC_NAVIGATE__?.(href);
    await sleep(20);
  });
};
const rejectImport = (error: unknown) =>
  act(async () => {
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: error }));
    await sleep(5);
  });
const probedUrls = () => probes.map(({ url }) => url);
const holdProbe = (url: string) => {
  let answer: (status: number) => void = () => undefined;
  probeAnswers.set(
    url,
    new Promise<number>((resolve) => {
      answer = resolve;
    }),
  );
  return (status: number) =>
    act(async () => {
      answer(status);
      await sleep(5);
    });
};
const reloadedKeys = () => JSON.parse(sessionStorage.getItem("akan.rsc.chunkReloads") ?? "[]") as string[];
const serveLazyPage = (pathname: string, failure: () => unknown) => {
  const host = `/_akan/client/gone${pathname}-host-a1.js`;
  const Lazy = lazy<{ default: ComponentType }>(() => Promise.reject(failure()));
  modules.set(host, { Host: () => <Lazy /> });
  served.set(pathname, () => [
    importRowOf(1, "/_akan/client/gone-boundary-a1.js", "Boundary"),
    importRowOf(2, host, "Host"),
    `0:${htmlOf(["$", "$L1", pathname, { children: ["$", "$L2", null, {}] }])}\n`,
  ]);
};

describe("rscClient lazy chunk the server no longer serves", () => {
  test("a 404 for it reloads the page the tab shows, the document's own included, once per chunk", async () => {
    const gone = chunkUrl("gone-a1");
    probeAnswers.set(gone, 404);
    probeAnswers.set(chunkUrl("gone-b1"), 404);
    await navigate("/home");
    await rejectImport(chromiumGone(gone));
    await rejectImport(chromiumGone(chunkUrl("gone-b1")));

    expect(probes).toEqual([{ url: gone, method: "HEAD", cache: "no-store" }]);
    expect(reloadedAt).toEqual([`${origin}/home`]);
    expect(reloadedKeys()).toEqual([`import() ${chromiumGone(gone).message}`]);

    await navigate("/away");
    await navigate("/home");
    await rejectImport(chromiumGone(gone));
    expect(probedUrls()).toEqual([gone, gone]);
    expect(reloadedAt).toEqual([`${origin}/home`]);
  });

  test("a gone chunk under the page's own boundary reloads the page a navigation rendered", async () => {
    const gone = chunkUrl("widget-a1");
    probeAnswers.set(gone, 404);
    serveLazyPage("/widget", () => firefoxGone(gone));
    await navigate("/widget#chat");

    expect(probedUrls()).toEqual([gone]);
    expect(reloadedAt).toEqual([`${origin}/widget#chat`]);
  });

  test("a served chunk, a failed probe, a 5xx, offline, a foreign URL or none leaves the page", async () => {
    const answered = {
      served: chunkUrl("served-a1"),
      unavailable: chunkUrl("busy-a1"),
      unanswered: chunkUrl("lost-a1"),
    };
    probeAnswers.set(answered.unavailable, 503);
    probeAnswers.set(answered.unanswered, "unanswered");
    const gone = chunkUrl("quiet-a1");
    probeAnswers.set(gone, 404);
    await navigate("/quiet");
    for (const url of Object.values(answered)) await rejectImport(chromiumGone(url));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      await rejectImport(chromiumGone(gone));
    } finally {
      Reflect.deleteProperty(navigator, "onLine");
    }
    await rejectImport(chromiumGone("https://cdn.example.com/_akan/client/chunks/quiet-a1.js"));
    await rejectImport(chromiumGone(`${origin}/assets/quiet-a1.js`));
    await rejectImport(new TypeError("Importing a module script failed."));
    await rejectImport(new TypeError("error loading dynamically imported module"));
    process.env.AKAN_BUNDLE_COMMAND = "start";
    await rejectImport(chromiumGone(gone));
    expect(probedUrls()).toEqual(Object.values(answered));
    expect(reloadedAt).toEqual([]);

    process.env.AKAN_BUNDLE_COMMAND = "build";
    await rejectImport(chromiumGone(gone));
    expect(reloadedAt).toEqual([`${origin}/quiet`]);
  });

  test("a navigation made while the probe is out leaves the page it went to in place", async () => {
    const gone = chunkUrl("first-a1");
    const answer = holdProbe(gone);
    await navigate("/first");
    await rejectImport(chromiumGone(gone));
    await navigate("/second");
    await answer(404);
    expect(probedUrls()).toEqual([gone]);
    expect(reloadedAt).toEqual([]);

    probeAnswers.set(gone, 404);
    await rejectImport(chromiumGone(gone));
    expect(reloadedAt).toEqual([`${origin}/second`]);
  });

  test.each(["beforeunload", "pagehide"])(
    "a document load the router never sees, after %s, is not reloaded over",
    async (type) => {
      const gone = chunkUrl(`unload-${type}`);
      const answer = holdProbe(gone);
      await navigate("/leaving");
      await rejectImport(chromiumGone(gone));
      window.dispatchEvent(new Event(type));
      await answer(404);
      expect(probedUrls()).toEqual([gone]);
      expect(reloadedAt).toEqual([]);

      probeAnswers.set(gone, 404);
      await rejectImport(chromiumGone(gone));
      expect(reloadedAt).toEqual([`${origin}/leaving`]);
    },
  );

  test("chunks that keep answering 404 reload one load of a chain, with or without the per-tab list", async () => {
    const chunks = Array.from({ length: 34 }, (_, n) => chunkUrl(`always-${n}`));
    for (const url of chunks) probeAnswers.set(url, 404);
    let navigationType = "navigate";
    const entries = spyOn(performance, "getEntriesByType").mockImplementation(
      (type) => (type === "navigation" ? [{ type: navigationType }] : []) as unknown as PerformanceEntryList,
    );
    //? One module instance stands in for each load: what the decision reads is the list, the navigation type and
    //? the document's own page, which a reload carries over or resets the same way.
    const reloadsOverLoads = async (keepList: boolean) => {
      sessionStorage.clear();
      reloadedAt = [];
      navigationType = "navigate";
      for (let load = 0; load < 40; load += 1) {
        if (!keepList) sessionStorage.clear();
        const before = reloadedAt.length;
        await navigate("/home");
        await rejectImport(chromiumGone(chunks[load % chunks.length] ?? ""));
        if (reloadedAt.length === before) break;
        navigationType = "reload";
      }
      return reloadedAt.length;
    };
    try {
      expect({ kept: await reloadsOverLoads(true), cleared: await reloadsOverLoads(false) }).toEqual({
        kept: 1,
        cleared: 1,
      });
    } finally {
      entries.mockRestore();
    }
  });

  test("a chunk the Flight client loaded is left to the chunk fallback, even when its element throws", async () => {
    const chunk = "/_akan/client/gone-routed-a1.js";
    sessionStorage.setItem("akan.rsc.chunkReloads", JSON.stringify([chunk]));
    probeAnswers.set(`${origin}${chunk}`, 404);
    failingChunks.set(chunk, chromiumGone(`${origin}${chunk}`));
    served.set("/routed", () => [
      importRowOf(1, "/_akan/client/gone-boundary-a1.js", "Boundary"),
      importRowOf(2, chunk, "Chat"),
      `0:${htmlOf(["$", "$L1", "/routed", { children: ["$", "$L2", null, {}] }])}\n`,
    ]);
    await navigate("/routed");
    expect(probedUrls()).toEqual([]);
    expect(reloadedAt).toEqual([]);

    const gone = chunkUrl("routed-lazy-a1");
    probeAnswers.set(gone, 404);
    await rejectImport(chromiumGone(gone));
    expect(probedUrls()).toEqual([gone]);
    expect(reloadedAt).toEqual([`${origin}/routed`]);
  });
});
