import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { isValidElement } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { type AkanModalComponent, createOverridable, override, UiOverrideProvider } from "../ui/UiOverride";
import { RouteElementComposer } from "./routeElementComposer";
import { RouteTreeBuilder } from "./routeTreeBuilder";
import { AkanSegmentOutletReference } from "./rscSegmentOutletReference";

async function renderToText(node: ReactNode): Promise<string> {
  return new Response(await renderToReadableStream(node)).text();
}

const pageInput = ({ pathRoute, params }: NonNullable<ReturnType<typeof RouteTreeBuilder.match>>) => ({
  pathRoute,
  params,
  searchParams: {},
});

const buildDocsApiRoutes = () =>
  new RouteTreeBuilder({
    "./__root_layout.tsx": async () => ({
      default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
    }),
    "./docs/_layout.tsx": async () => ({
      default: ({ children }: { children: ReactNode }) => <section>docs:{children}</section>,
    }),
    "./docs/api.tsx": async () => ({ default: () => <article>api</article> }),
  }).build();

function containsElementType(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => containsElementType(child, type));
  if (!isValidElement(node)) return false;
  if (node.type === type) return true;
  const props = node.props as { children?: ReactNode; fallback?: ReactNode };
  return containsElementType(props.children, type) || containsElementType(props.fallback, type);
}

function findElementProp(node: ReactNode, type: unknown, propName: string): unknown {
  if (Array.isArray(node)) {
    for (const child of node) {
      const value = findElementProp(child, type, propName);
      if (value !== undefined) return value;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const props = node.props as { children?: ReactNode; fallback?: ReactNode; [key: string]: unknown };
  if (node.type === type) return props[propName];
  return findElementProp(props.children, type, propName) ?? findElementProp(props.fallback, type, propName);
}

describe("RouteTreeBuilder implicit locale", () => {
  test("matches locale-prefixed routes", () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
      "./foo.tsx": async () => ({ default: () => null }),
    }).build();

    const matched = RouteTreeBuilder.match("/ko/foo", routes);
    expect(matched?.params).toEqual({ lang: "ko" });
    expect(matched?.pathRoute.path).toBe("/:lang/foo");
    expect(matched?.pathRoute.renderRootLayouts).toHaveLength(1);
  });

  test("merges a basePath root's head over the app root's, keeping what the deeper one does not write", async () => {
    const prevBasePaths = process.env.AKAN_PUBLIC_BASE_PATHS;
    process.env.AKAN_PUBLIC_BASE_PATHS = "foo";
    try {
      const routes = new RouteTreeBuilder({
        "./__root_layout.tsx": async () => ({
          default: ({ children }: { children: ReactNode }) => children,
          head: (
            <>
              <title>Root</title>
              <link rel="manifest" href="/root.webmanifest" />
            </>
          ),
        }),
        "./foo/__root_layout.tsx": async () => ({
          default: ({ children }: { children: ReactNode }) => children,
          head: <title>Foo</title>,
        }),
        "./foo/bar.tsx": async () => ({ default: () => null }),
        "./foo/baz.tsx": async () => ({ default: () => null, head: <meta name="description" content="Baz" /> }),
      }).build();
      const bar = RouteTreeBuilder.match("/ko/foo/bar", routes);
      const baz = RouteTreeBuilder.match("/ko/foo/baz", routes);
      if (!bar || !baz) throw new Error("route did not match");

      const barHtml = await renderToText(await RouteElementComposer.resolveHead(pageInput(bar)));
      const bazHtml = await renderToText(await RouteElementComposer.resolveHead(pageInput(baz)));

      expect(barHtml).toContain("Foo</title>");
      expect(barHtml).not.toContain("Root</title>");
      expect(barHtml).toContain("/root.webmanifest");
      expect(bazHtml).toContain("Foo</title>");
      expect(bazHtml).toContain("/root.webmanifest");
      expect(bazHtml).toContain('content="Baz"');
    } finally {
      process.env.AKAN_PUBLIC_BASE_PATHS = prevBasePaths;
    }
  });

  test("renders without a head that throws, so the layout's own gate still answers; a redirect from a head routes", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        head: <title>Root</title>,
      }),
      "./org/_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        generateHead: async () => {
          throw new Error("Access denied by guard: User");
        },
      }),
      "./org/home.tsx": async () => ({ default: () => null }),
      "./moved.tsx": async () => ({
        default: () => null,
        generateHead: () => {
          throw Object.assign(new Error("Redirect to /en/new"), { digest: "AKAN_REDIRECT" });
        },
      }),
    }).build();
    const org = RouteTreeBuilder.match("/en/org/home", routes);
    const moved = RouteTreeBuilder.match("/en/moved", routes);
    if (!org || !moved) throw new Error("route did not match");

    expect(await renderToText(await RouteElementComposer.resolveHead(pageInput(org)))).toContain("Root</title>");
    await expect(RouteElementComposer.resolveHead(pageInput(moved))).rejects.toThrow("Redirect to /en/new");
  });

  test("allows wsConnect export on internal root layouts", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        head: "root",
        wsConnect: false,
      }),
      "./foo.tsx": async () => ({ default: () => null }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/foo", routes);

    expect(matched && (await RouteElementComposer.resolveHead(pageInput(matched)))).toBe("root");
  });

  test("resolves SSR frame state from layout and page config chain", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        pageConfig: { safeArea: true, topInset: 48 },
      }),
      "./foo/_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        pageConfig: { bottomInset: 64 },
      }),
      "./foo/detail.tsx": async () => ({
        default: () => null,
        pageConfig: { topInset: 96, transition: "stack" },
      }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/foo/detail", routes);
    if (!matched) throw new Error("route did not match");

    const resolved = await RouteElementComposer.resolveSsrFramePathRoute({ pathRoute: matched.pathRoute });

    expect(resolved.pageConfigChain).toHaveLength(3);
    expect(resolved.explicitPageConfigKeys).toMatchObject({ safeArea: true, topInset: true, bottomInset: true });
    expect(resolved.pageState).toMatchObject({
      topInset: 96,
      bottomInset: 64,
      topSafeArea: 0,
      bottomSafeArea: 0,
      transition: "stack",
    });
  });

  test("renders nothing when the generated internal root layout has no head", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        generateHead: () => null,
      }),
      "./foo.tsx": async () => ({ default: () => null }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/foo", routes);
    if (!matched) throw new Error("route did not match");

    const head = await RouteElementComposer.resolveHead(pageInput(matched));

    await expect(renderToText(head)).resolves.toBe("");
  });

  test("merges heads root first, a deeper level taking over each tag it writes", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        head: (
          <>
            <title>Root</title>
            <link rel="icon" href="/root.ico" />
          </>
        ),
      }),
      "./docs/_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        head: (
          <>
            <title>Docs Layout</title>
            <meta name="description" content="Docs layout description" />
          </>
        ),
      }),
      "./docs/guide.tsx": async () => ({
        default: () => null,
        head: <title>Guide</title>,
      }),
      "./docs/reference.tsx": async () => ({
        default: () => null,
      }),
    }).build();
    const guide = RouteTreeBuilder.match("/ko/docs/guide", routes);
    const reference = RouteTreeBuilder.match("/ko/docs/reference", routes);
    if (!guide || !reference) throw new Error("route did not match");

    const guideHtml = await renderToText(await RouteElementComposer.resolveHead(pageInput(guide)));
    const referenceHtml = await renderToText(await RouteElementComposer.resolveHead(pageInput(reference)));

    expect(guideHtml).toContain("Guide</title>");
    expect(guideHtml).not.toContain("Docs Layout</title>");
    expect(guideHtml).toContain("Docs layout description");
    expect(guideHtml).toContain("/root.ico");
    expect(guideHtml.match(/<title>/g)).toHaveLength(1);
    expect(referenceHtml).toContain("Docs Layout</title>");
    expect(referenceHtml).not.toContain("Root</title>");
    expect(referenceHtml).toContain("Docs layout description");
    expect(referenceHtml).toContain("/root.ico");
  });

  test("keeps a layout's canonical and og:url off every page below it, which names its own URL or none", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        head: (
          <>
            <title>Root</title>
            <link rel="canonical" href="https://example.com" />
            <meta property="og:url" content="https://example.com" />
            <meta property="og:title" content="Root" />
          </>
        ),
      }),
      "./docs/guide.tsx": async () => ({ default: () => null, head: <title>Guide</title> }),
      "./docs/api.tsx": async () => ({
        default: () => null,
        head: <link rel="canonical" href="https://example.com/docs/api" />,
      }),
      "./about.tsx": async () => ({ default: () => null }),
    }).build();
    const headHtml = async (pathname: string) => {
      const matched = RouteTreeBuilder.match(pathname, routes);
      if (!matched) throw new Error(`route did not match: ${pathname}`);
      return await renderToText(await RouteElementComposer.resolveHead(pageInput(matched)));
    };

    const guideHtml = await headHtml("/en/docs/guide");
    const apiHtml = await headHtml("/en/docs/api");
    const aboutHtml = await headHtml("/en/about");

    expect(guideHtml).toContain("Guide</title>");
    expect(guideHtml).toContain('content="Root"');
    expect(guideHtml).not.toContain("canonical");
    expect(guideHtml).not.toContain("og:url");
    expect(apiHtml).toContain('href="https://example.com/docs/api"');
    expect(apiHtml.match(/canonical/g)).toHaveLength(1);
    expect(apiHtml).not.toContain("og:url");
    expect(aboutHtml).toContain("Root</title>");
    expect(aboutHtml).not.toContain("canonical");
    expect(aboutHtml).not.toContain("og:url");
  });
  test("supports route groups and cached lazy modules", async () => {
    let loadCount = 0;
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
      "./(marketing)/about.tsx": async () => {
        loadCount += 1;
        return { default: () => null, head: "about" };
      },
    }).build();
    const matched = RouteTreeBuilder.match("/ko/about", routes);

    expect(matched?.pathRoute.path).toBe("/:lang/about");
    expect(matched && (await RouteElementComposer.resolveHead(pageInput(matched)))).toBe("about");
    expect(matched && (await RouteElementComposer.resolveHead(pageInput(matched)))).toBe("about");
    expect(loadCount).toBe(1);
    // The root layout loads too: its head is a level of the merge even when it writes none.
    expect(RouteTreeBuilder.getCacheStats()).toMatchObject({
      moduleCount: 2,
      loadedModuleCount: 2,
      cacheHits: 2,
      cacheMisses: 2,
    });
  });

  test("rejects duplicate route patterns and unsupported page exports", () => {
    expect(() =>
      new RouteTreeBuilder({
        "./users/[id].tsx": async () => ({ default: () => null }),
        "./users/:id.tsx": async () => ({ default: () => null }),
      }).build(),
    ).toThrow();

    const routes = new RouteTreeBuilder({
      "./bad.tsx": async () => ({ default: () => null, loader: () => null }) as never,
    }).build();
    const matched = RouteTreeBuilder.match("/ko/bad", routes);

    expect(matched && RouteElementComposer.resolveHead(pageInput(matched))).rejects.toThrow(
      '[route-convention] unsupported export "loader"',
    );

    const routesWithBadFallback = new RouteTreeBuilder({
      "./bad-fallback.tsx": async () => ({ default: () => null, NotFound: () => null }) as never,
    }).build();
    const badFallback = RouteTreeBuilder.match("/ko/bad-fallback", routesWithBadFallback);
    expect(badFallback && RouteElementComposer.resolveHead(pageInput(badFallback))).rejects.toThrow(
      '[route-convention] unsupported export "NotFound"',
    );

    const routesWithMetadata = new RouteTreeBuilder({
      "./with-metadata.tsx": async () => ({ default: () => null, metadata: { title: "x" } }) as never,
    }).build();
    const withMetadata = RouteTreeBuilder.match("/ko/with-metadata", routesWithMetadata);
    expect(withMetadata && RouteElementComposer.resolveHead(pageInput(withMetadata))).rejects.toThrow(
      '[route-convention] unsupported export "metadata"',
    );
  });

  test("composes nearest layout NotFound and Error fallbacks", async () => {
    const builder = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
        NotFound: ({ pathname }: { pathname: string }) => <p>root missing {pathname}</p>,
      }),
      "./docs/_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => <section>docs:{children}</section>,
        NotFound: ({ pathname, params }: { pathname: string; params: Record<string, string> }) => (
          <p>
            docs missing {params.lang}:{pathname}
          </p>
        ),
        Error: ({ error }: { error?: unknown }) => (
          <p>docs error {error instanceof Error ? error.message : "unknown"}</p>
        ),
      }),
      "./docs/guide.tsx": async () => ({ default: () => <article>guide</article> }),
    });
    const routes = builder.build();
    const matched = RouteTreeBuilder.match("/ko/docs/guide", routes);
    if (!matched) throw new Error("route did not match");

    const notFound = await RouteElementComposer.composeFallback({
      kind: "not-found",
      route: matched.pathRoute,
      params: matched.params,
      searchParams: {},
      pathname: "/ko/docs/guide",
    });
    const error = await RouteElementComposer.composeFallback({
      kind: "error",
      route: matched.pathRoute,
      params: matched.params,
      searchParams: {},
      pathname: "/ko/docs/guide",
      error: new Error("boom"),
    });

    const notFoundHtml = await renderToText(notFound);
    const errorHtml = await renderToText(error);
    expect(notFoundHtml).toContain("root:");
    expect(notFoundHtml).toContain("docs:");
    expect(notFoundHtml).toContain("docs missing");
    expect(notFoundHtml).toContain("/ko/docs/guide");
    expect(errorHtml).toContain("docs error");
    expect(errorHtml).toContain("boom");

    const unmatched = RouteTreeBuilder.matchFallback("/ko/docs/missing/path", builder.getFallbackRoutes());
    expect(unmatched?.fallbackRoute.path).toBe("/:lang/docs");
    const unmatchedNotFound =
      unmatched &&
      (await RouteElementComposer.composeFallback({
        kind: "not-found",
        route: unmatched.fallbackRoute,
        params: unmatched.params,
        searchParams: {},
        pathname: "/ko/docs/missing/path",
      }));
    const unmatchedHtml = await renderToText(unmatchedNotFound);
    expect(unmatchedHtml).toContain("docs missing");
    expect(unmatchedHtml).toContain("/ko/docs/missing/path");
  });

  test("composes route suffix renders", async () => {
    const matched = RouteTreeBuilder.match("/ko/docs/api", buildDocsApiRoutes());
    if (!matched) throw new Error("route did not match");

    const suffix = RouteElementComposer.composeSuffix({ ...pageInput(matched), patchStartIndex: 2 });
    const invalidSuffix = RouteElementComposer.composeSuffix({ ...pageInput(matched), patchStartIndex: 99 });

    expect(await renderToText(suffix)).toContain("api");
    expect(await renderToText(suffix)).not.toContain("docs:");
    expect(invalidSuffix).toBeNull();
  });

  test("wraps full page renders in a guarded segment outlet without wrapping suffix renders", () => {
    const previous = process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT;
    try {
      const matched = RouteTreeBuilder.match("/ko/docs/api", buildDocsApiRoutes());
      if (!matched) throw new Error("route did not match");

      process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = "0";
      const guardOff = RouteElementComposer.compose(pageInput(matched));
      process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = "1";
      const guardOn = RouteElementComposer.compose(pageInput(matched));
      const suffix = RouteElementComposer.composeSuffix({ ...pageInput(matched), patchStartIndex: 2 });

      expect(containsElementType(guardOff, AkanSegmentOutletReference)).toBe(false);
      expect(containsElementType(guardOn, AkanSegmentOutletReference)).toBe(true);
      expect(findElementProp(guardOn, AkanSegmentOutletReference, "segmentKey")).toBe("slot:layout:/:lang:1:2");
      expect(containsElementType(suffix, AkanSegmentOutletReference)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT;
      else process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = previous;
    }
  });
});

describe("RouteTreeBuilder _overrides", () => {
  const DefaultModal: AkanModalComponent = ({ title }) => <div data-skin="default">{title}</div>;
  const BrandModal: AkanModalComponent = ({ title }) => <div data-skin="brand">{title}</div>;
  const InnerModal: AkanModalComponent = ({ title }) => <div data-skin="inner">{title}</div>;
  const Widget = createOverridable("Modal", DefaultModal);

  // Mirrors the generated "use client" wrapper: its default mounts UiOverrideProvider with the manifest's slot map.
  const overridesWrapperModule = (slots: { Modal: AkanModalComponent }) => {
    const value = override(slots);
    return {
      default: ({ children }: { children?: ReactNode }) => (
        <UiOverrideProvider value={value}>{children}</UiOverrideProvider>
      ),
    };
  };

  const buildOverrideTree = () =>
    new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
      "./_overrides.tsx": async () => overridesWrapperModule({ Modal: BrandModal }),
      "./foo.tsx": async () => ({ default: () => <Widget open onCancel={() => {}} title="FOO" /> }),
      "./(admin)/_overrides.tsx": async () => overridesWrapperModule({ Modal: InnerModal }),
      "./(admin)/panel.tsx": async () => ({ default: () => <Widget open onCancel={() => {}} title="PANEL" /> }),
    }).build();

  async function renderMatched(routes: ReturnType<typeof buildOverrideTree>, pathname: string): Promise<string> {
    const matched = RouteTreeBuilder.match(pathname, routes);
    if (!matched) throw new Error(`route did not match: ${pathname}`);
    return renderToText(RouteElementComposer.compose(pageInput(matched)));
  }

  test("a root _overrides.tsx activates the override for the whole subtree", async () => {
    const html = await renderMatched(buildOverrideTree(), "/ko/foo");
    expect(html).toContain('data-skin="brand"');
    expect(html).not.toContain('data-skin="default"');
    expect(html).toContain("FOO");
  });

  test("a nested _overrides.tsx wins over an ancestor (closest scope wins)", async () => {
    const html = await renderMatched(buildOverrideTree(), "/ko/panel");
    expect(html).toContain('data-skin="inner"');
    expect(html).not.toContain('data-skin="brand"');
    expect(html).toContain("PANEL");
  });

  // Assert the resolved skin, not provider presence: in the regression the provider existed, inside the root layout.
  const shellLayoutModule = (title: string) => ({
    default: ({ children }: { children: ReactNode }) => (
      <>
        <Widget onCancel={() => {}} open title={title} />
        {children}
      </>
    ),
  });

  test("a root layout's own UI resolves through the manifest, not past it", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => shellLayoutModule("SHELL"),
      "./_overrides.tsx": async () => overridesWrapperModule({ Modal: BrandModal }),
      "./foo.tsx": async () => ({ default: () => null }),
    }).build();
    const html = await renderMatched(routes, "/ko/foo");
    expect(html).toContain("SHELL");
    expect(html).toContain('data-skin="brand"');
    expect(html).not.toContain('data-skin="default"');
  });

  test("crossing a nested _overrides.tsx keeps every render above it, so only the new branch remounts", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => shellLayoutModule("SHELL"),
      "./_overrides.tsx": async () => overridesWrapperModule({ Modal: BrandModal }),
      "./(ws)/_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
      "./(ws)/chat.tsx": async () => ({ default: () => <Widget open onCancel={() => {}} title="CHAT" /> }),
      "./(ws)/pageBlock/_overrides.tsx": async () => overridesWrapperModule({ Modal: InnerModal }),
      "./(ws)/pageBlock/edit.tsx": async () => ({ default: () => <Widget open onCancel={() => {}} title="EDIT" /> }),
    }).build();
    const stackOf = (pathname: string) => {
      const matched = RouteTreeBuilder.match(pathname, routes);
      if (!matched) throw new Error(`route did not match: ${pathname}`);
      return [...matched.pathRoute.renderRootLayouts, ...matched.pathRoute.renderLayouts];
    };
    const chatStack = stackOf("/ko/chat");
    const editStack = stackOf("/ko/pageBlock/edit");
    expect(editStack.slice(0, chatStack.length)).toEqual(chatStack);
    expect(editStack).toHaveLength(chatStack.length + 1);

    const chatHtml = await renderMatched(routes, "/ko/chat");
    expect(chatHtml).toContain('data-skin="brand"');
    expect(chatHtml).not.toContain('data-skin="inner"');
    const editHtml = await renderMatched(routes, "/ko/pageBlock/edit");
    expect(editHtml).toMatch(/data-skin="brand">SHELL/);
    expect(editHtml).toMatch(/data-skin="inner">EDIT/);
  });

  test("a route-group layout is a root layout too, and its UI resolves the same way", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
      "./_overrides.tsx": async () => overridesWrapperModule({ Modal: BrandModal }),
      "./(canvas)/_layout.tsx": async () => shellLayoutModule("CANVAS"),
      "./(canvas)/board.tsx": async () => ({ default: () => null }),
    }).build();
    const html = await renderMatched(routes, "/ko/board");
    expect(html).toContain("CANVAS");
    expect(html).toContain('data-skin="brand"');
    expect(html).not.toContain('data-skin="default"');
  });
});
