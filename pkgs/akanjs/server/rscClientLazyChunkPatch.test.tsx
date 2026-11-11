import "../test/registerDom";
import { afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { TransformStream } from "node:stream/web";
import { act, Component, type ComponentType, type ReactNode } from "react";
import { lazy } from "../webkit/lazy";
import {
  AKAN_RSC_CURRENT_STATE_HEADER,
  AKAN_RSC_NOT_FOUND_HEADER,
  AKAN_RSC_PATCH_HEAD_SAFE_HEADER,
  AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER,
  AKAN_RSC_PATCH_SEGMENT_PATH_HEADER,
  AKAN_RSC_PATCH_START_INDEX_HEADER,
  AKAN_RSC_PATCH_START_SEGMENT_HEADER,
  AKAN_RSC_RESPONSE_STATE_HEADER,
  type AkanRouterStateV1,
  decodeAkanRouterState,
  encodeAkanHeadSnapshot,
  encodeAkanRouterState,
  encodeAkanRscPatchSegmentPath,
} from "./routeState";
import * as outletModule from "./rscSegmentOutlet";

const origin = "http://localhost";
const outletId = "akan-outlet";
const boundaryChunk = "/_akan/client/patch-boundary-a1.js";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const linkError = () =>
  new SyntaxError("The requested module 'akanjs/store' does not provide an export named 'storeOfAnotherBuild'");
const shown = () => document.querySelector("main")?.textContent;

class Boundary extends Component<{ children?: ReactNode; label: string }, { failed: boolean }> {
  override state: { failed: boolean } = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? `${this.props.label} failed` : this.props.children;
  }
}

const modules = new Map<string, Record<string, unknown>>([
  [outletId, outletModule],
  [boundaryChunk, { Boundary }],
]);
const stateOf = (pathname: string): AkanRouterStateV1 => ({
  version: 1,
  href: `${origin}${pathname}`,
  routeId: pathname,
  segments: [
    { key: "root", path: "/", kind: "root-layout" },
    { key: `page:${pathname}`, path: pathname, kind: "page" },
  ],
  headKey: "deck layouts",
});
const importRowOf = (row: number, chunk: string, name: string) =>
  `${row}:I${JSON.stringify([chunk, [chunk, chunk], name, 1])}\n`;
const wholeRowsOf = (pathname: string) => {
  const head = { layouts: { version: 1, nodes: [] }, page: { version: 1, nodes: [{ tag: "title", text: pathname }] } };
  const outlet = ["$", "$L1", null, { segmentKey: "slot:root:1", children: pathname }];
  const body = {
    children: [
      ["$", "nav", "n", { children: "deck" }],
      ["$", "main", "m", { children: outlet }],
    ],
  };
  const html = {
    children: [
      ["$", "head", "h", { children: ["$", "$L2", null, head] }],
      ["$", "body", "b", body],
    ],
  };
  const outletRows = `1:I${JSON.stringify([outletId, [], "AkanSegmentOutlet"])}\n2:I${JSON.stringify([outletId, [], "AkanRouteHead"])}\n`;
  return `${outletRows}0:${JSON.stringify(["$", "html", null, html])}\n`;
};
const lazyRowsOf = (label: string) => {
  const host = `/_akan/client/patch-${label}-host-a1.js`;
  const Lazy = lazy<{ default: ComponentType }>(() => Promise.reject(linkError()));
  modules.set(host, { Host: () => <Lazy /> });
  return `${importRowOf(3, boundaryChunk, "Boundary")}${importRowOf(4, host, "Host")}`;
};
const lazyElement = (label: string) => ["$", "$L3", null, { label, children: ["$", "$L4", null, {}] }];
const patchResponseOf = (pathname: string) => {
  const state = stateOf(pathname);
  return new Response(`${lazyRowsOf(pathname)}0:${JSON.stringify(lazyElement(pathname))}\n`, {
    headers: {
      "Content-Type": "text/x-component",
      "X-Akan-Rsc-Partial": "patch",
      [AKAN_RSC_PATCH_START_INDEX_HEADER]: "1",
      [AKAN_RSC_PATCH_START_SEGMENT_HEADER]: `page:${pathname}`,
      [AKAN_RSC_PATCH_SEGMENT_PATH_HEADER]: encodeAkanRscPatchSegmentPath(state.segments.map(({ key }) => key)),
      [AKAN_RSC_PATCH_HEAD_SAFE_HEADER]: "1",
      [AKAN_RSC_PATCH_HEAD_SNAPSHOT_HEADER]:
        encodeAkanHeadSnapshot({ version: 1, nodes: [{ tag: "title", text: `${pathname} patched` }] }) ?? "",
      [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(state),
    },
  });
};
const notFoundViewOf = (pathname: string) => {
  const body = { children: ["$", "main", null, { children: lazyElement(pathname) }] };
  const html = {
    children: [
      ["$", "head", "h", {}],
      ["$", "body", "b", body],
    ],
  };
  return new Response(`${lazyRowsOf(pathname)}0:${JSON.stringify(["$", "html", null, html])}\n`, {
    status: 404,
    headers: { "Content-Type": "text/x-component", [AKAN_RSC_NOT_FOUND_HEADER]: "view" },
  });
};

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = "1";
  process.env.AKAN_BUNDLE_COMMAND = "build";
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(`${origin}/deck/a`);
  Object.assign(globalThis, {
    TransformStream,
    __webpack_require__: Object.assign((id: string) => modules.get(id) ?? {}, { u: () => "" }),
    __webpack_get_script_filename__: (chunkId: string) => chunkId,
    __webpack_chunk_load__: () => Promise.resolve(),
    __AKAN_RSC_INITIAL_STATE__: encodeAkanRouterState(stateOf("/deck/a")),
    __RSC_CHUNKS__: [[1, wholeRowsOf("/deck/a")]],
    __RSC_CLOSED__: true,
    fetch: async (input: string | URL, init?: RequestInit) => {
      const { pathname } = new URL(new URL(String(input)).searchParams.get("url") ?? "/", origin);
      const from = decodeAkanRouterState(new Headers(init?.headers).get(AKAN_RSC_CURRENT_STATE_HEADER));
      if (pathname === "/gone") return notFoundViewOf(pathname);
      if (from?.headKey === "deck layouts") return patchResponseOf(pathname);
      return new Response(wholeRowsOf(pathname), {
        headers: {
          "Content-Type": "text/x-component",
          [AKAN_RSC_RESPONSE_STATE_HEADER]: encodeAkanRouterState(stateOf(pathname)),
        },
      });
    },
  });
  document.documentElement.innerHTML =
    "<head><title>/deck/a</title></head><body><nav>deck</nav><main>/deck/a</main></body>";
  await act(async () => {
    await import("./rscClient");
  });
});

let reloadedAt: string[] = [];
const restorers: (() => void)[] = [];

beforeEach(() => {
  sessionStorage.clear();
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

describe("rscClient lazy chunk on a page a patch or a not-found view put on screen", () => {
  //? Both commits leave `shownNode` null: what they show came from a response, so it may hold another build's modules.
  test("a patch laid on the document's own page reloads it for a lazy link error", async () => {
    await navigate("/deck/a");
    await rejectImport(linkError());
    expect(reloadedAt).toEqual([]);

    await navigate("/deck/b");

    expect(shown()).toBe("/deck/b failed");
    expect(document.title).toBe("/deck/b patched");
    expect(reloadedAt).toEqual([`${origin}/deck/b`]);
  });

  test("a not-found view a navigation from the document's own page rendered reloads for one", async () => {
    await navigate("/deck/a");
    await rejectImport(linkError());
    expect(shown()).toBe("/deck/a");
    expect(reloadedAt).toEqual([]);

    await navigate("/gone");

    expect(shown()).toBe("/gone failed");
    expect(reloadedAt).toEqual([`${origin}/gone`]);
  });
});
