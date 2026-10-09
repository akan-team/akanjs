import { describe, expect, test } from "bun:test";
import type { PathRoute, RouteRender } from "akanjs/client";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { AkanNotFoundError } from "../client/router";
import { RouteElementComposer, type RouteNotFoundInPlace } from "./routeElementComposer";

function createDeferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}

function suspendingPageRender(gate: Promise<void>): RouteRender {
  return {
    render: (async () => {
      await gate;
      return <div id="page-content">PAGE_CONTENT</div>;
    }) as RouteRender["render"],
    Loading: () => <div id="page-loading">PAGE_LOADING</div>,
  };
}

const composePage = (gate: Promise<void>, navKey?: string) =>
  RouteElementComposer.composeRenders({
    renders: [suspendingPageRender(gate)],
    params: {},
    searchParams: {},
    navKey,
  }) as ReactElement;

const renderDocument = (body: ReactNode) =>
  renderToReadableStream(
    <html lang="en">
      <body>{body}</body>
    </html>,
  );

describe("RouteElementComposer streaming", () => {
  test("streams the page Loading fallback as the shell before the delayed page resolves", async () => {
    const gate = createDeferred();
    const stream = await renderDocument(composePage(gate.promise));

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (!html.includes("PAGE_LOADING")) {
      const next = await Promise.race([reader.read(), sleep(1000).then(() => null)]);
      if (!next) throw new Error("shell was not flushed before the page resolved");
      if (next.done) throw new Error("stream ended before the Loading fallback appeared");
      html += decoder.decode(next.value, { stream: true });
    }

    expect(html).toContain("PAGE_LOADING");
    expect(html).not.toContain("PAGE_CONTENT");

    gate.resolve();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();

    expect(html).toContain("PAGE_CONTENT");
  });

  test("blocking (allReady) withholds the whole document until the page resolves", async () => {
    const gate = createDeferred();
    const stream = await renderDocument(composePage(gate.promise));

    let allReadySettled = false;
    const allReady = stream.allReady.then(() => {
      allReadySettled = true;
    });

    await sleep(50);
    expect(allReadySettled).toBe(false);

    gate.resolve();
    await allReady;
    expect(allReadySettled).toBe(true);

    expect(await drain(stream)).toContain("PAGE_CONTENT");
  });
});

const pending = new Promise<void>(() => {});

describe("RouteElementComposer navigation keying", () => {
  test("keys the leaf page Suspense by navKey when it has a Loading", () => {
    const el = composePage(pending, "/loadingtest/bbb");

    expect(isValidElement(el)).toBe(true);
    expect(el.key).toBe("akan-loading:/loadingtest/bbb");
  });

  test("different navKeys produce different keys so the boundary remounts on navigation", () => {
    const aaa = composePage(pending, "/loadingtest/aaa");
    const bbb = composePage(pending, "/loadingtest/bbb");

    expect(aaa.key).not.toBe(bbb.key);
  });

  test("does not key a page without a Loading (keeps keep-old-UI transition behavior)", () => {
    const el = RouteElementComposer.composeRenders({
      renders: [{ render: (() => <div>x</div>) as RouteRender["render"] }],
      params: {},
      searchParams: {},
      navKey: "/loadingtest/bbb",
    }) as ReactElement;

    expect(el.key).toBeNull();
  });

  test("does not key when navKey is absent", () => {
    const el = composePage(pending);

    expect(el.key).toBeNull();
  });
});

describe("RouteElementComposer.resolveSuffixLoadings", () => {
  test("populates Loading on the patched stack so the suffix fallback is not empty", async () => {
    const pageRender: RouteRender = {
      render: (async () => <div>content</div>) as RouteRender["render"],
      resolveLoading: () => {
        pageRender.Loading = () => <div id="suffix-loading">SUFFIX_LOADING</div>;
      },
    };
    const pathRoute = {
      renderRootLayouts: [],
      renderLayouts: [],
      renderPage: pageRender,
    } as unknown as PathRoute;

    expect(pageRender.Loading).toBeUndefined();
    await RouteElementComposer.resolveSuffixLoadings(pathRoute, 0);
    expect(pageRender.Loading).toBeDefined();

    const el = RouteElementComposer.composeSuffix({
      pathRoute,
      params: {},
      searchParams: {},
      patchStartIndex: 0,
      navKey: "/loadingtest/bbb",
    }) as ReactElement;

    expect(el.key).toBe("akan-loading:/loadingtest/bbb");
    const fallback = (el.props as { fallback?: ReactNode }).fallback;
    expect(isValidElement(fallback)).toBe(true);
  });
});

describe("RouteElementComposer not-found in place", () => {
  const layoutRender = (NotFound?: (props: { pathname: string }) => ReactNode): RouteRender => ({
    render: (({ children }: { children: ReactNode }) => <section>layout:{children}</section>) as RouteRender["render"],
    resolveNotFound: async () => NotFound as never,
  });
  const goneRender: RouteRender = {
    render: (async () => {
      await sleep(1);
      throw new AkanNotFoundError();
    }) as RouteRender["render"],
  };
  const notFoundOption = (hits: { count: number }): RouteNotFoundInPlace => ({
    pathname: "/en/gone",
    onNotFound: () => {
      hits.count += 1;
    },
    systemFallback: () => <p>system card</p>,
  });

  test("renders the nearest layout's NotFound where the page threw, and reports it", async () => {
    const hits = { count: 0 };
    const element = RouteElementComposer.composeRenders({
      renders: [layoutRender(({ pathname }) => <p>{`missing ${pathname}`}</p>), layoutRender(), goneRender],
      params: {},
      searchParams: {},
      notFound: notFoundOption(hits),
    });
    const html = await drain(await renderDocument(element));
    expect(html).toContain("missing /en/gone");
    expect(html).not.toContain("system card");
    expect(hits.count).toBe(1);
  });

  test("falls back to the system card when no layout above the thrower declares a NotFound", async () => {
    const hits = { count: 0 };
    const element = RouteElementComposer.composeRenders({
      renders: [layoutRender(), goneRender],
      params: {},
      searchParams: {},
      notFound: notFoundOption(hits),
    });
    expect(await drain(await renderDocument(element))).toContain("system card");
    expect(hits.count).toBe(1);
  });
});
