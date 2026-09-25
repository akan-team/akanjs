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
  test("matches locale-prefixed routes while keeping special routes at root", () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({ default: ({ children }: { children: ReactNode }) => children }),
      "./foo.tsx": async () => ({ default: () => null }),
      "./robots.txt.tsx": async () => ({ default: () => null }),
    }).build();

    const matched = RouteTreeBuilder.match("/ko/foo", routes);
    expect(matched?.params).toEqual({ lang: "ko" });
    expect(matched?.pathRoute.path).toBe("/:lang/foo");
    expect(matched?.pathRoute.renderRootLayouts).toHaveLength(1);

    const robots = RouteTreeBuilder.match("/robots.txt", routes);
    expect(robots?.params).toEqual({});
    expect(robots?.pathRoute.isSpecialRoute).toBe(true);
    expect(robots?.pathRoute.renderRootLayouts).toHaveLength(0);
  });

  test("uses the nearest route head without merging parents", async () => {
    const prevBasePaths = process.env.AKAN_PUBLIC_BASE_PATHS;
    process.env.AKAN_PUBLIC_BASE_PATHS = "foo";
    try {
      const routes = new RouteTreeBuilder({
        "./__root_layout.tsx": async () => ({
          default: ({ children }: { children: ReactNode }) => children,
          head: "root",
        }),
        "./foo/__root_layout.tsx": async () => ({
          default: ({ children }: { children: ReactNode }) => children,
          head: "foo-root",
        }),
        "./foo/bar.tsx": async () => ({ default: () => null }),
        "./foo/baz.tsx": async () => ({ default: () => null, head: "baz-page" }),
      }).build();

      const bar = RouteTreeBuilder.match("/ko/foo/bar", routes);
      const baz = RouteTreeBuilder.match("/ko/foo/baz", routes);
      expect(
        bar &&
          (await RouteElementComposer.resolveHead({ pathRoute: bar.pathRoute, params: bar.params, searchParams: {} })),
      ).toBe("foo-root");
      expect(
        baz &&
          (await RouteElementComposer.resolveHead({ pathRoute: baz.pathRoute, params: baz.params, searchParams: {} })),
      ).toBe("baz-page");
    } finally {
      process.env.AKAN_PUBLIC_BASE_PATHS = prevBasePaths;
    }
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

    expect(
      matched &&
        (await RouteElementComposer.resolveHead({
          pathRoute: matched.pathRoute,
          params: matched.params,
          searchParams: {},
        })),
    ).toBe("root");
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

  test("allows generated internal root layouts to expose head and metadata channels", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        generateHead: () => null,
        generateMetadata: () => ({}),
      }),
      "./foo.tsx": async () => ({ default: () => null }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/foo", routes);
    if (!matched) throw new Error("route did not match");

    const head = await RouteElementComposer.resolveHead({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: {},
    });

    await expect(renderToText(head)).resolves.toBe("");
  });

  test("resolves declarative metadata exports into head elements", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        metadata: { title: "Root", description: "Root description" },
      }),
      "./docs.tsx": async () => ({
        default: () => null,
        generateMetadata: ({ params, searchParams }) => ({
          title: `Docs ${params.lang}`,
          description: `Section ${searchParams.section}`,
          robots: "index,follow",
          openGraph: { title: "OG Docs", images: ["/og.png"] },
          twitter: { card: "summary_large_image", title: "Twitter Docs", images: ["/twitter.png", "/twitter-2.png"] },
          alternates: {
            canonical: "https://example.com/docs",
            languages: { ko: "https://example.com/ko/docs", en: "https://example.com/en/docs" },
          },
        }),
      }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/docs", routes);
    if (!matched) throw new Error("route did not match");

    const head = await RouteElementComposer.resolveHead({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: { section: "api" },
    });
    const resolvedHead = await RouteElementComposer.resolveHeadWithMetadata({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: { section: "api" },
    });
    const html = await renderToText(head);

    expect(resolvedHead.hasExplicitLanguageAlternates).toBe(true);
    expect(resolvedHead.headSnapshot?.version).toBe(1);
    expect(resolvedHead.headSnapshot?.nodes[0]).toEqual({ tag: "title", text: "Docs ko" });
    expect(resolvedHead.headSnapshot?.nodes[1]).toEqual({
      tag: "meta",
      attrs: { name: "description", content: "Section api" },
    });
    expect(html).toContain("Docs ko</title>");
    expect(html).toContain('data-akan-head="route"');
    expect(html).toContain('data-akan-head-key="title:0"');
    expect(html).toContain('name="description"');
    expect(html).toContain('content="Section api"');
    expect(html).toContain('name="robots"');
    expect(html).toContain('content="index,follow"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('content="OG Docs"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('content="/og.png"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('content="summary_large_image"');
    expect(html).toContain('name="twitter:image"');
    expect(html).toContain('content="/twitter.png"');
    expect(html).toContain('content="/twitter-2.png"');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('hrefLang="ko"');
    expect(html).toContain('href="https://example.com/ko/docs"');
    expect(html).toContain('hrefLang="en"');
    expect(html).toContain('href="https://example.com/en/docs"');
    expect(html).not.toContain("Root description");
  });

  test("resolves query-dependent metadata snapshots from target search params", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
      }),
      "./docs.tsx": async () => ({
        default: () => null,
        generateMetadata: ({ searchParams }) => {
          const page = String(searchParams.page ?? "1");
          return {
            title: `Docs page ${page}`,
            description: `Listing page ${page}`,
            alternates: { canonical: `https://example.com/docs?page=${page}` },
          };
        },
      }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/docs", routes);
    if (!matched) throw new Error("route did not match");

    const first = await RouteElementComposer.resolveHeadWithMetadata({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: { page: "1" },
    });
    const second = await RouteElementComposer.resolveHeadWithMetadata({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: { page: "2" },
    });

    expect(first.headSnapshot?.nodes).toContainEqual({ tag: "title", text: "Docs page 1" });
    expect(first.headSnapshot?.nodes).toContainEqual({
      tag: "link",
      attrs: { rel: "canonical", href: "https://example.com/docs?page=1" },
    });
    expect(second.headSnapshot?.nodes).toContainEqual({ tag: "title", text: "Docs page 2" });
    expect(second.headSnapshot?.nodes).toContainEqual({
      tag: "meta",
      attrs: { name: "description", content: "Listing page 2" },
    });
    expect(second.headSnapshot?.nodes).toContainEqual({
      tag: "link",
      attrs: { rel: "canonical", href: "https://example.com/docs?page=2" },
    });
  });

  test("renders empty metadata exports as empty head fragments", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        metadata: { title: "Root" },
      }),
      "./empty-static.tsx": async () => ({
        default: () => null,
        metadata: {},
      }),
      "./empty-dynamic.tsx": async () => ({
        default: () => null,
        generateMetadata: () => ({}),
      }),
    }).build();
    const staticMatch = RouteTreeBuilder.match("/ko/empty-static", routes);
    const dynamicMatch = RouteTreeBuilder.match("/ko/empty-dynamic", routes);
    if (!staticMatch || !dynamicMatch) throw new Error("route did not match");

    const staticHead = await RouteElementComposer.resolveHead({
      pathRoute: staticMatch.pathRoute,
      params: staticMatch.params,
      searchParams: {},
    });
    const dynamicHead = await RouteElementComposer.resolveHead({
      pathRoute: dynamicMatch.pathRoute,
      params: dynamicMatch.params,
      searchParams: {},
    });

    await expect(renderToText(staticHead)).resolves.toBe("");
    await expect(renderToText(dynamicHead)).resolves.toBe("");
  });

  test("does not treat unknown plain head objects as metadata", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
      }),
      "./bad-head-object.tsx": async () => ({
        default: () => null,
        generateHead: () => ({ custom: "value" }) as never,
      }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/bad-head-object", routes);
    if (!matched) throw new Error("route did not match");

    const head = await RouteElementComposer.resolveHead({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: {},
    });
    const resolvedHead = await RouteElementComposer.resolveHeadWithMetadata({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: {},
    });

    expect(head as unknown).toEqual({ custom: "value" });
    expect(resolvedHead.headSnapshot).toBeUndefined();
  });

  test("keeps automatic language alternates enabled for canonical-only metadata", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
      }),
      "./canonical.tsx": async () => ({
        default: () => null,
        metadata: { alternates: { canonical: "https://example.com/canonical" } },
      }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/canonical", routes);
    if (!matched) throw new Error("route did not match");

    const resolvedHead = await RouteElementComposer.resolveHeadWithMetadata({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: {},
    });

    expect(resolvedHead.hasExplicitLanguageAlternates).toBe(false);
    expect(await renderToText(resolvedHead.node)).toContain('rel="canonical"');
  });

  test("detects explicit language alternates from generated wrapper head metadata objects", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
      }),
      "./wrapped-languages.tsx": async () => ({
        default: () => null,
        generateHead: () =>
          ({
            alternates: { languages: { ko: "https://example.com/ko/wrapped" } },
          }) as never,
      }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/wrapped-languages", routes);
    if (!matched) throw new Error("route did not match");

    const resolvedHead = await RouteElementComposer.resolveHeadWithMetadata({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: {},
    });

    expect(resolvedHead.hasExplicitLanguageAlternates).toBe(true);
    expect(await renderToText(resolvedHead.node)).toContain('href="https://example.com/ko/wrapped"');
  });

  test("uses nearest metadata without merging parent metadata", async () => {
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        metadata: {
          title: "Root",
          description: "Root description",
          openGraph: { siteName: "Root Site", images: ["/root-og.png"] },
          alternates: { canonical: "https://example.com/root" },
        },
      }),
      "./docs/_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => children,
        metadata: {
          title: "Docs Layout",
          description: "Docs layout description",
          openGraph: { siteName: "Docs Site" },
        },
      }),
      "./docs/guide.tsx": async () => ({
        default: () => null,
        metadata: { title: "Guide" },
      }),
      "./docs/reference.tsx": async () => ({
        default: () => null,
      }),
    }).build();
    const guide = RouteTreeBuilder.match("/ko/docs/guide", routes);
    const reference = RouteTreeBuilder.match("/ko/docs/reference", routes);
    if (!guide || !reference) throw new Error("route did not match");

    const guideHtml = await renderToText(
      await RouteElementComposer.resolveHead({
        pathRoute: guide.pathRoute,
        params: guide.params,
        searchParams: {},
      }),
    );
    const referenceHtml = await renderToText(
      await RouteElementComposer.resolveHead({
        pathRoute: reference.pathRoute,
        params: reference.params,
        searchParams: {},
      }),
    );

    expect(guideHtml).toContain("Guide</title>");
    expect(guideHtml).not.toContain("Docs layout description");
    expect(guideHtml).not.toContain("Docs Site");
    expect(guideHtml).not.toContain("/root-og.png");
    expect(referenceHtml).toContain("Docs Layout</title>");
    expect(referenceHtml).toContain("Docs layout description");
    expect(referenceHtml).toContain("Docs Site");
  });

  test("supports route groups, repeated search params, and cached lazy modules", async () => {
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
    expect(RouteTreeBuilder.parseSearchParams("?tag=a&tag=b&sort=latest")).toEqual({
      tag: ["a", "b"],
      sort: "latest",
    });

    expect(
      matched &&
        (await RouteElementComposer.resolveHead({
          pathRoute: matched.pathRoute,
          params: matched.params,
          searchParams: {},
        })),
    ).toBe("about");
    expect(
      matched &&
        (await RouteElementComposer.resolveHead({
          pathRoute: matched.pathRoute,
          params: matched.params,
          searchParams: {},
        })),
    ).toBe("about");
    expect(loadCount).toBe(1);
    expect(RouteTreeBuilder.getCacheStats()).toMatchObject({
      moduleCount: 2,
      loadedModuleCount: 1,
      cacheHits: 1,
      cacheMisses: 1,
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

    expect(
      matched &&
        RouteElementComposer.resolveHead({ pathRoute: matched.pathRoute, params: matched.params, searchParams: {} }),
    ).rejects.toThrow('[route-convention] unsupported export "loader"');

    const routesWithBadFallback = new RouteTreeBuilder({
      "./bad-fallback.tsx": async () => ({ default: () => null, NotFound: () => null }) as never,
    }).build();
    const badFallback = RouteTreeBuilder.match("/ko/bad-fallback", routesWithBadFallback);
    expect(
      badFallback &&
        RouteElementComposer.resolveHead({
          pathRoute: badFallback.pathRoute,
          params: badFallback.params,
          searchParams: {},
        }),
    ).rejects.toThrow('[route-convention] unsupported export "NotFound"');

    const routesWithConflictingHead = new RouteTreeBuilder({
      "./bad-head.tsx": async () => ({ default: () => null, head: "x", metadata: { title: "x" } }) as never,
    }).build();
    const badHead = RouteTreeBuilder.match("/ko/bad-head", routesWithConflictingHead);
    expect(
      badHead &&
        RouteElementComposer.resolveHead({
          pathRoute: badHead.pathRoute,
          params: badHead.params,
          searchParams: {},
        }),
    ).rejects.toThrow("head/generateHead and metadata/generateMetadata cannot both be exported");

    const routesWithConflictingMetadata = new RouteTreeBuilder({
      "./bad-metadata.tsx": async () =>
        ({
          default: () => null,
          metadata: { title: "x" },
          generateMetadata: () => ({ title: "y" }),
        }) as never,
    }).build();
    const badMetadata = RouteTreeBuilder.match("/ko/bad-metadata", routesWithConflictingMetadata);
    expect(
      badMetadata &&
        RouteElementComposer.resolveHead({
          pathRoute: badMetadata.pathRoute,
          params: badMetadata.params,
          searchParams: {},
        }),
    ).rejects.toThrow("metadata and generateMetadata cannot both be exported");

    const routesWithConflictingGenerate = new RouteTreeBuilder({
      "./bad-generate.tsx": async () =>
        ({ default: () => null, generateHead: () => "x", generateMetadata: () => ({ title: "x" }) }) as never,
    }).build();
    const badGenerate = RouteTreeBuilder.match("/ko/bad-generate", routesWithConflictingGenerate);
    expect(
      badGenerate &&
        RouteElementComposer.resolveHead({
          pathRoute: badGenerate.pathRoute,
          params: badGenerate.params,
          searchParams: {},
        }),
    ).rejects.toThrow("head/generateHead and metadata/generateMetadata cannot both be exported");
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
    const routes = new RouteTreeBuilder({
      "./__root_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
      }),
      "./docs/_layout.tsx": async () => ({
        default: ({ children }: { children: ReactNode }) => <section>docs:{children}</section>,
      }),
      "./docs/api.tsx": async () => ({ default: () => <article>api</article> }),
    }).build();
    const matched = RouteTreeBuilder.match("/ko/docs/api", routes);
    if (!matched) throw new Error("route did not match");

    const suffix = RouteElementComposer.composeSuffix({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: {},
      patchStartIndex: 2,
    });
    const invalidSuffix = RouteElementComposer.composeSuffix({
      pathRoute: matched.pathRoute,
      params: matched.params,
      searchParams: {},
      patchStartIndex: 99,
    });

    expect(await renderToText(suffix)).toContain("api");
    expect(await renderToText(suffix)).not.toContain("docs:");
    expect(invalidSuffix).toBeNull();
  });

  test("wraps full page renders in a guarded segment outlet without wrapping suffix renders", () => {
    const previous = process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT;
    try {
      const routes = new RouteTreeBuilder({
        "./__root_layout.tsx": async () => ({
          default: ({ children }: { children: ReactNode }) => <main>root:{children}</main>,
        }),
        "./docs/_layout.tsx": async () => ({
          default: ({ children }: { children: ReactNode }) => <section>docs:{children}</section>,
        }),
        "./docs/api.tsx": async () => ({ default: () => <article>api</article> }),
      }).build();
      const matched = RouteTreeBuilder.match("/ko/docs/api", routes);
      if (!matched) throw new Error("route did not match");

      process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = "0";
      const guardOff = RouteElementComposer.compose({
        pathRoute: matched.pathRoute,
        params: matched.params,
        searchParams: {},
      });
      process.env.AKAN_PUBLIC_RSC_PARTIAL_COMMIT = "1";
      const guardOn = RouteElementComposer.compose({
        pathRoute: matched.pathRoute,
        params: matched.params,
        searchParams: {},
      });
      const suffix = RouteElementComposer.composeSuffix({
        pathRoute: matched.pathRoute,
        params: matched.params,
        searchParams: {},
        patchStartIndex: 2,
      });

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
  // The page renders through the real "Modal" override slot, exactly like a shipped `<Modal>` call site.
  const Widget = createOverridable("Modal", DefaultModal);

  // Mirrors the build: a `_overrides.tsx` manifest's default is `override({ ... })` (a plain slot map), served
  // through a generated `"use client"` wrapper whose default mounts the provider with that map.
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
    return renderToText(
      RouteElementComposer.compose({ pathRoute: matched.pathRoute, params: matched.params, searchParams: {} }),
    );
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
});
