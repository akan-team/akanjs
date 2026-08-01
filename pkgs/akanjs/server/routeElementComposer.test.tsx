import { describe, expect, test } from "bun:test";
import type { PathRoute, RouteRender } from "akanjs/client";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { RouteElementComposer } from "./routeElementComposer";

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

// A page whose `render` stays pending until `gate` resolves, with a `Loading`
// export wired the way `RouteTreeBuilder` wires it onto the RouteRender.
function suspendingPageRender(gate: Promise<void>): RouteRender {
  return {
    render: (async () => {
      await gate;
      return <div id="page-content">PAGE_CONTENT</div>;
    }) as RouteRender["render"],
    Loading: () => <div id="page-loading">PAGE_LOADING</div>,
  };
}

describe("RouteElementComposer streaming", () => {
  test("streams the page Loading fallback as the shell before the delayed page resolves", async () => {
    const gate = createDeferred();
    const body = RouteElementComposer.composeRenders({
      renders: [suspendingPageRender(gate.promise)],
      params: {},
      searchParams: {},
    });
    const stream = await renderToReadableStream(
      <html lang="en">
        <body>{body}</body>
      </html>,
    );

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = "";
    // The shell (with the Loading fallback) must flush while `render` is still
    // pending. If the runtime instead buffered until completion, the read below
    // would only resolve after we release the gate — never within the timeout.
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
    const body = RouteElementComposer.composeRenders({
      renders: [suspendingPageRender(gate.promise)],
      params: {},
      searchParams: {},
    });
    const stream = await renderToReadableStream(
      <html lang="en">
        <body>{body}</body>
      </html>,
    );

    let allReadySettled = false;
    const allReady = stream.allReady.then(() => {
      allReadySettled = true;
    });

    // `stream.allReady` is exactly what `pageConfig.ssr: "block"` awaits. It must
    // not settle while the page render is still pending.
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
    const el = RouteElementComposer.composeRenders({
      renders: [suspendingPageRender(pending)],
      params: {},
      searchParams: {},
      navKey: "/loadingtest/bbb",
    }) as ReactElement;

    expect(isValidElement(el)).toBe(true);
    expect(el.key).toBe("akan-loading:/loadingtest/bbb");
  });

  test("different navKeys produce different keys so the boundary remounts on navigation", () => {
    const aaa = RouteElementComposer.composeRenders({
      renders: [suspendingPageRender(pending)],
      params: {},
      searchParams: {},
      navKey: "/loadingtest/aaa",
    }) as ReactElement;
    const bbb = RouteElementComposer.composeRenders({
      renders: [suspendingPageRender(pending)],
      params: {},
      searchParams: {},
      navKey: "/loadingtest/bbb",
    }) as ReactElement;

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
    const el = RouteElementComposer.composeRenders({
      renders: [suspendingPageRender(pending)],
      params: {},
      searchParams: {},
    }) as ReactElement;

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

    // The suffix path never runs resolveHead, so Loading starts unset.
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
