import "../test/registerDom";
import { afterEach, beforeAll, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test";
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
const linkError = () =>
  new SyntaxError("The requested module 'akanjs/store/agent' does not provide an export named 'AgentChatLog'");
const otherLinkError = () =>
  new SyntaxError("The requested module 'akanjs/store' does not provide an export named 'storeOfAnotherBuild'");

class Boundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  override state: { failed: boolean } = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const served = new Map<string, () => string[]>();
const modules = new Map<string, Record<string, unknown>>([["/_akan/client/boundary-a1.js", { Boundary }]]);
const failingChunks = new Map<string, Error>();
let heldFetch: Promise<void> | undefined;
const ownPageLoads: string[] = [];

const rejectImport = (error: unknown) =>
  act(async () => {
    window.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: error }));
    await sleep(5);
  });

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
    fetch: async (input: string | URL) => {
      await heldFetch;
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
  const reload = spyOn(window.location, "reload").mockImplementation(() => {
    ownPageLoads.push(window.location.href);
  });
  const quiet = spyOn(console, "warn").mockImplementation(() => undefined);
  await rejectImport(linkError());
  //? Here, not in a test: a refresh clears the page cache, and with it the document's own page to replay.
  await navigate("/before-replay");
  await navigate("/home");
  await rejectImport(linkError());
  for (const spy of [reload, quiet]) spy.mockRestore();
});

let assign: Mock<(href: string | URL) => void>;
let replace: Mock<(href: string | URL) => void>;
let consoleError: Mock<(...data: unknown[]) => void>;
let reloadedAt: string[] = [];
const restorers: (() => void)[] = [];

beforeEach(() => {
  sessionStorage.clear();
  process.env.AKAN_BUNDLE_COMMAND = "build";
  assign = spyOn(window.location, "assign").mockImplementation(() => undefined);
  replace = spyOn(window.location, "replace").mockImplementation(() => undefined);
  reloadedAt = [];
  const reload = spyOn(window.location, "reload").mockImplementation(() => {
    reloadedAt.push(window.location.href);
  });
  consoleError = spyOn(console, "error").mockImplementation(() => undefined);
  const quiet = spyOn(console, "warn").mockImplementation(() => undefined);
  restorers.push(...[assign, replace, reload, consoleError, quiet].map((spy) => () => spy.mockRestore()));
});

afterEach(() => {
  for (const restore of restorers.splice(0)) restore();
  served.clear();
  failingChunks.clear();
});

const documentLoads = () => ({
  assigned: assign.mock.calls.map(([href]) => String(href)),
  replaced: replace.mock.calls.map(([href]) => String(href)),
  reloaded: [...reloadedAt],
});
const navigate = async (href: string, options?: { shallow?: boolean; replace?: boolean }) => {
  await act(async () => {
    await globalThis.__AKAN_RSC_NAVIGATE__?.(href, options);
    await sleep(20);
  });
};
const reloadedKeys = () => JSON.parse(sessionStorage.getItem("akan.rsc.chunkReloads") ?? "[]") as string[];
//? The page's own boundary, as an app's error page would be: an uncaught error unmounts the root for every later test.
const serveLazyPage = (pathname: string, failure: () => unknown) => {
  const host = `/_akan/client${pathname}-host-a1.js`;
  const Lazy = lazy<{ default: ComponentType }>(() => Promise.reject(failure()));
  modules.set(host, { Host: () => <Lazy /> });
  served.set(pathname, () => [
    importRowOf(1, "/_akan/client/boundary-a1.js", "Boundary"),
    importRowOf(2, host, "Host"),
    `0:${htmlOf(["$", "$L1", pathname, { children: ["$", "$L2", null, {}] }])}\n`,
  ]);
};

describe("rscClient lazy chunk that fails to link", () => {
  test("on a page a navigation rendered, it reloads the address the tab shows, once per failure", async () => {
    serveLazyPage("/lazy", linkError);
    await navigate("/lazy#notes");
    await rejectImport(otherLinkError());
    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [`${origin}/lazy#notes`] });
    expect(reloadedKeys()).toEqual([`import() ${linkError().message}`]);
    expect(consoleError.mock.calls.filter(([logged]) => logged instanceof SyntaxError)).toHaveLength(1);

    await navigate("/away");
    await navigate("/lazy");
    expect(documentLoads().reloaded).toEqual([`${origin}/lazy#notes`]);
  });

  test("a second page with the same failure does not reload again, and another failure does", async () => {
    serveLazyPage("/product/1", linkError);
    serveLazyPage("/product/2", linkError);
    serveLazyPage("/product/3", otherLinkError);
    await navigate("/product/1");
    await navigate("/product/2");
    expect(documentLoads().reloaded).toEqual([`${origin}/product/1`]);

    await navigate("/product/3");
    expect(documentLoads().reloaded).toEqual([`${origin}/product/1`, `${origin}/product/3`]);
    expect(reloadedKeys()).toEqual([`import() ${linkError().message}`, `import() ${otherLinkError().message}`]);
  });

  test("an import() rejected outside React reloads too, but not on the document's own page, even replayed", async () => {
    expect(ownPageLoads).toEqual([]);
    await navigate("/plain");
    await navigate("/plain?tab=2#chat", { shallow: true, replace: true });
    await rejectImport(linkError());

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [`${origin}/plain?tab=2#chat`] });
  });

  test("a fetch failure, an evaluation error, offline or a start bundle leaves the page in place", async () => {
    await navigate("/quiet");
    await rejectImport(new TypeError("Failed to fetch dynamically imported module: /_akan/client/chunks/x1.js"));
    await rejectImport(new TypeError("Cannot read properties of undefined (reading 'map')"));
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      await rejectImport(linkError());
    } finally {
      Reflect.deleteProperty(navigator, "onLine");
    }
    process.env.AKAN_BUNDLE_COMMAND = "start";
    await rejectImport(linkError());
    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });

    process.env.AKAN_BUNDLE_COMMAND = "build";
    await rejectImport(linkError());
    expect(documentLoads().reloaded).toEqual([`${origin}/quiet`]);
  });

  test("a navigation to another page under way leaves the page it is leaving in place", async () => {
    await navigate("/leaving");
    const held = { release: () => {} };
    heldFetch = new Promise<void>((resolve) => {
      held.release = resolve;
    });
    let leaving: Promise<void> | undefined;
    try {
      await act(async () => {
        leaving = globalThis.__AKAN_RSC_NAVIGATE__?.("/next");
        await sleep(5);
      });
      await rejectImport(linkError());
      expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });
    } finally {
      heldFetch = undefined;
      await act(async () => {
        held.release();
        await leaving;
      });
    }

    await rejectImport(linkError());
    expect(documentLoads().reloaded).toEqual([`${origin}/next`]);
  });

  test("a refresh of the page on screen after a shallow update does not count as leaving it", async () => {
    await navigate("/tabbed");
    await navigate("/tabbed?tab=2", { shallow: true, replace: true });
    const held = { release: () => {} };
    heldFetch = new Promise<void>((resolve) => {
      held.release = resolve;
    });
    let refreshing: Promise<void> | undefined;
    try {
      await act(async () => {
        refreshing = globalThis.__AKAN_RSC_REFRESH__?.();
        await sleep(5);
      });
      await rejectImport(linkError());
    } finally {
      heldFetch = undefined;
      await act(async () => {
        held.release();
        await refreshing;
      });
    }

    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [`${origin}/tabbed?tab=2`] });
  });

  test("a chunk the Flight client loaded is left to the chunk fallback, even when its element throws", async () => {
    const chunk = "/_akan/client/handled-a1.js";
    sessionStorage.setItem("akan.rsc.chunkReloads", JSON.stringify([chunk]));
    failingChunks.set(chunk, linkError());
    served.set("/handled", () => [
      importRowOf(1, "/_akan/client/boundary-a1.js", "Boundary"),
      importRowOf(2, chunk, "Chat"),
      `0:${htmlOf(["$", "$L1", "/handled", { children: ["$", "$L2", null, {}] }])}\n`,
    ]);
    await navigate("/handled");
    expect(documentLoads()).toEqual({ assigned: [], replaced: [], reloaded: [] });

    await rejectImport(linkError());
    expect(documentLoads().reloaded).toEqual([`${origin}/handled`]);
  });
});
