import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { layout, pathContext, type RouteRender, router, Translator } from "akanjs/client";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RenderLayer } from "./RenderLayer";

class UnreachableErr extends Error {
  constructor() {
    super("base.error.serverUnreachable");
  }
}

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
});

let mounted: { root: Root; container: HTMLElement } | null = null;
const mount = async (renders: RouteRender[]) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () => {
    root.render(<RenderLayer renders={renders} index={0} params={{}} searchParams={{}} />);
  });
  return container;
};

const layoutOf = (render: (props: { children: ReactNode }) => ReactNode, isAsync = false): RouteRender => ({
  kind: "layout",
  isAsync,
  render: (isAsync ? async (props: { children: ReactNode }) => render(props) : render) as RouteRender["render"],
});
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

afterEach(async () => {
  if (!mounted) return;
  const { root, container } = mounted;
  await act(async () => root.unmount());
  container.remove();
  mounted = null;
});

describe("RenderLayer", () => {
  test("a page whose render cannot reach the server says so and renders again on retry", async () => {
    let calls = 0;
    const page: RouteRender = {
      kind: "page",
      isAsync: true,
      render: async () => {
        calls += 1;
        if (calls === 1) throw new UnreachableErr();
        return <main>loaded</main>;
      },
    };
    const container = await mount([page]);
    await settle();

    expect(container.querySelector("[role=alert]")?.textContent).toContain("base.error.serverUnreachable");
    const retry = container.querySelector("button");
    expect(retry).not.toBeNull();

    await act(async () => retry?.click());
    await settle();

    expect(calls).toBe(2);
    expect(container.querySelector("[role=alert]")).toBeNull();
    expect(container.textContent).toBe("loaded");
  });

  test("hands each chain render and loading fallback the path of the entry it draws, encoded as the URL is", async () => {
    const seen: Record<string, string | undefined> = {};
    const tabs = layoutOf(({ children }) => {
      seen.layout = Translator.getRenderPath();
      return <div>{children}</div>;
    }, true);
    const header: RouteRender = {
      ...layoutOf(({ children }) => <section>{children}</section>, true),
      Loading: () => {
        seen.loading = Translator.getRenderPath();
        return null;
      },
    };
    const tag: RouteRender = {
      kind: "page",
      isAsync: true,
      render: (async () => {
        seen.page = Translator.getRenderPath();
        return <p>tag</p>;
      }) as RouteRender["render"],
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { root, container };
    const location = {
      pathname: "/ko/tag/한글",
      pathRoute: { path: "/tag/:name", renderRootLayouts: [], renderLayouts: [], renderPage: tag },
    };
    await act(async () => {
      root.render(
        <pathContext.Provider value={{ location } as never}>
          <RenderLayer renders={[tabs, header, tag]} index={0} params={{ name: "한글" }} searchParams={{}} />
        </pathContext.Provider>,
      );
    });
    await settle();

    expect(container.textContent).toBe("tag");
    const encoded = "/ko/tag/%ED%95%9C%EA%B8%80";
    expect(seen).toEqual({ layout: encoded, loading: encoded, page: encoded });
    expect(Translator.getRenderPath()).toBeUndefined();
  });

  test("draws a page only once its route guards admit the visitor, and nothing while they send them elsewhere", async () => {
    const replaced: string[] = [];
    router.init({
      type: "csr",
      lang: "en",
      router: {
        push: () => undefined,
        replace: (href) => void replaced.push(href),
        back: () => undefined,
        refresh: () => undefined,
      },
    });
    const trail: string[] = [];
    const session = { isSignedIn: false };
    const notes: RouteRender = {
      kind: "page",
      isAsync: true,
      guard: async () => {
        trail.push("guard");
        if (!session.isSignedIn) router.replace("/signin");
      },
      render: (async () => {
        trail.push("render");
        return <p>notes</p>;
      }) as RouteRender["render"],
    };
    const shell = layoutOf(({ children }) => <main>{children}</main>, true);
    const visit = async () => {
      if (mounted) {
        const { root, container } = mounted;
        await act(async () => root.unmount());
        container.remove();
      }
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      mounted = { root, container };
      const location = {
        pathname: "/en/notes",
        params: {},
        searchParams: {},
        pathRoute: { path: "/notes", renderRootLayouts: [], renderLayouts: [shell], renderPage: notes },
      };
      await act(async () => {
        root.render(
          <pathContext.Provider value={{ location } as never}>
            <RenderLayer renders={[shell, notes]} index={0} params={{}} searchParams={{}} />
          </pathContext.Provider>,
        );
      });
      await settle();
      return container;
    };

    expect((await visit()).textContent).toBe("");
    expect(trail).toEqual(["guard"]);
    expect(replaced).toEqual(["/en/signin"]);

    session.isSignedIn = true;
    trail.length = 0;
    expect((await visit()).textContent).toBe("notes");
    expect(trail).toEqual(["guard", "render"]);
  });

  test("draws the page once a guard moves the router within its own route, under a layout that reads none of it", async () => {
    const replaced: string[] = [];
    router.init({
      type: "csr",
      lang: "en",
      router: {
        push: () => undefined,
        replace: (href) => void replaced.push(href),
        back: () => undefined,
        refresh: () => undefined,
      },
    });
    const notes: RouteRender = {
      kind: "page",
      isAsync: true,
      paramNames: [],
      guard: async ({ searchParams }) => {
        if (!searchParams.tab) router.redirect("/notes?tab=all");
      },
      render: (async () => <p>notes</p>) as RouteRender["render"],
    };
    const shell = layoutOf(({ children }) => <main>{children}</main>, true);
    const pathRoute = { path: "/notes", renderRootLayouts: [], renderLayouts: [shell], renderPage: notes };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { root, container };
    const draw = async (search: string, searchParams: Record<string, string>) => {
      const location = {
        href: `/en/notes${search}`,
        entryId: "e1",
        pathname: "/en/notes",
        params: {},
        searchParams,
        pathRoute,
      };
      await act(async () => {
        root.render(
          <pathContext.Provider value={{ location } as never}>
            <RenderLayer renders={[shell, notes]} index={0} params={{}} searchParams={searchParams} />
          </pathContext.Provider>,
        );
      });
      await settle();
    };

    await draw("", {});
    expect(container.textContent).toBe("");
    expect(replaced).toEqual(["/en/notes?tab=all"]);
    await draw("?tab=all", { tab: "all" });
    await settle();
    expect(container.textContent).toBe("notes");
  });

  test("keeps a sync page off screen until the root layout's guard admits the visitor", async () => {
    const replaced: string[] = [];
    router.init({
      type: "csr",
      lang: "en",
      router: {
        push: () => undefined,
        replace: (href) => void replaced.push(href),
        back: () => undefined,
        refresh: () => undefined,
      },
    });
    const session = { isSignedIn: false };
    const root: RouteRender = {
      ...layoutOf(({ children }) => children, true),
      guard: async () => {
        if (!session.isSignedIn) router.replace("/signin");
      },
    };
    const legacy: RouteRender = {
      kind: "page",
      render: (({ searchParams }: { searchParams: Record<string, string> }) => (
        <p>notes {searchParams.tab}</p>
      )) as RouteRender["render"],
    };
    const pathRoute = { path: "/notes", renderRootLayouts: [root], renderLayouts: [], renderPage: legacy };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const reactRoot = createRoot(container);
    mounted = { root: reactRoot, container };
    const draw = async (entryId: string, searchParams: Record<string, string>) => {
      const location = { href: "/en/notes", entryId, pathname: "/en/notes", params: {}, searchParams, pathRoute };
      await act(async () => {
        reactRoot.render(
          <pathContext.Provider value={{ location } as never}>
            <RenderLayer renders={[legacy]} index={0} params={{}} searchParams={searchParams} />
          </pathContext.Provider>,
        );
      });
      await settle();
    };

    await draw("e1", {});
    expect(container.textContent).toBe("");
    expect(replaced).toEqual(["/en/signin"]);

    session.isSignedIn = true;
    await draw("e2", { tab: "all" });
    expect(container.textContent).toBe("notes all");
    await draw("e2", { tab: "mine" });
    expect(container.textContent).toBe("notes mine");
  });

  test("asks a remounted page's guards again, so a sign-out while it was gone keeps it off screen", async () => {
    const replaced: string[] = [];
    router.init({
      type: "csr",
      lang: "en",
      router: {
        push: () => undefined,
        replace: (href) => void replaced.push(href),
        back: () => undefined,
        refresh: () => undefined,
      },
    });
    const session = { isSignedIn: true };
    const notes: RouteRender = {
      kind: "page",
      isAsync: true,
      guard: async () => {
        if (!session.isSignedIn) router.replace("/signin");
      },
      render: (async () => <p>notes</p>) as RouteRender["render"],
    };
    const pathRoute = { path: "/notes", renderRootLayouts: [], renderLayouts: [], renderPage: notes };
    const location = { entryId: "e1", pathname: "/en/notes", params: {}, searchParams: {}, pathRoute };
    const visit = async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <pathContext.Provider value={{ location } as never}>
            <RenderLayer renders={[notes]} index={0} params={{}} searchParams={{}} />
          </pathContext.Provider>,
        );
      });
      await settle();
      const text = container.textContent;
      await act(async () => root.unmount());
      container.remove();
      return text;
    };

    expect(await visit()).toBe("notes");
    session.isSignedIn = false;
    expect(await visit()).toBe("");
    expect(replaced).toEqual(["/en/signin"]);
  });

  test("draws a legacy page's new query at once once its guards let it in, without asking them again", async () => {
    router.init({
      type: "csr",
      lang: "en",
      router: { push: () => undefined, replace: () => undefined, back: () => undefined, refresh: () => undefined },
    });
    let guardRuns = 0;
    const shell = layout()
      .guard(() => {
        guardRuns += 1;
      })
      .render(({ children }) => children)
      .toRouteModule();
    const root: RouteRender = { kind: "layout", isAsync: true, render: shell.default as never, guard: shell.guard };
    const legacy: RouteRender = {
      kind: "page",
      render: (({ searchParams }: { searchParams: Record<string, string> }) => (
        <p>{`q=${searchParams.q}`}</p>
      )) as RouteRender["render"],
    };
    const pathRoute = { path: "/search", renderRootLayouts: [root], renderLayouts: [], renderPage: legacy };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const reactRoot = createRoot(container);
    mounted = { root: reactRoot, container };
    const draw = async (q: string) => {
      const searchParams = { q };
      const location = { entryId: "e1", pathname: "/en/search", params: { lang: "en" }, searchParams, pathRoute };
      await act(async () => {
        reactRoot.render(
          <pathContext.Provider value={{ location } as never}>
            <RenderLayer renders={[legacy]} index={0} params={{ lang: "en" }} searchParams={searchParams} />
          </pathContext.Provider>,
        );
      });
    };

    await draw("a");
    await settle();
    expect(container.textContent).toBe("q=a");
    await draw("ab");
    expect(container.textContent).toBe("q=ab");
    expect(guardRuns).toBe(1);
  });
});
