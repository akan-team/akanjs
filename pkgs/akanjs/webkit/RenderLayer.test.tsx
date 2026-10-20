import "../test/registerDom";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  layout,
  type PageActivity,
  page,
  pageActivityContext,
  pathContext,
  type RouteRender,
  router,
  Translator,
} from "akanjs/client";
import { Activity, act, type ReactNode, StrictMode, useState } from "react";
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

const routerOf = () => {
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
  return replaced;
};

interface Shown {
  activity?: PageActivity;
  entryId?: string;
  params?: Record<string, string>;
  searchParams?: Record<string, string>;
  isStrict?: boolean;
}
//? Draws the layers of one stack entry as the CSR stack does: parked pages sit in a hidden `<Activity>`.
const stackOf = (renders: RouteRender[], pathRoute: { path: string }) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { root, container };
  const show = async ({
    activity = "current",
    entryId = "e1",
    params = { lang: "en" },
    searchParams = {},
    isStrict = false,
  }: Shown) => {
    const search = new URLSearchParams(searchParams).toString();
    const location = {
      href: `/en${pathRoute.path}${search ? `?${search}` : ""}`,
      entryId,
      pathname: `/en${pathRoute.path}`,
      params,
      searchParams,
      pathRoute,
    };
    const tree = (
      <Activity mode={activity === "hidden" ? "hidden" : "visible"}>
        <pageActivityContext.Provider value={{ activity, focused: activity === "current" }}>
          <pathContext.Provider value={{ location } as never}>
            <RenderLayer renders={renders} index={0} params={params} searchParams={searchParams} />
          </pathContext.Provider>
        </pageActivityContext.Provider>
      </Activity>
    );
    await act(async () => root.render(isStrict ? <StrictMode>{tree}</StrictMode> : tree));
    await settle();
  };
  return { container, show };
};
const guardedLayoutOf = (guard: () => void): RouteRender => {
  const shell = layout()
    .guard(guard)
    .render(({ children }) => <main>{children}</main>)
    .toRouteModule();
  return { kind: "layout", isAsync: true, render: shell.default as never, guard: shell.guard };
};

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
  test("asks only for the page in front, keeping a parked page's state, and draws nothing once a check refuses", async () => {
    const replaced = routerOf();
    const session = { isSignedIn: true };
    let guardRuns = 0;
    let instances = 0;
    const shell = guardedLayoutOf(() => {
      guardRuns += 1;
      if (!session.isSignedIn) router.replace("/signin");
    });
    const Settings = () => {
      useState(() => ++instances);
      return <p>settings</p>;
    };
    const legacy: RouteRender = { kind: "page", render: Settings as RouteRender["render"] };
    const { container, show } = stackOf([shell, legacy], {
      path: "/settings",
      renderRootLayouts: [],
      renderLayouts: [shell],
      renderPage: legacy,
    } as never);

    await show({});
    expect(container.textContent).toBe("settings");
    await show({ activity: "hidden" });
    await show({});
    expect([guardRuns, instances]).toEqual([2, 1]);
    expect(container.textContent).toBe("settings");

    await show({ activity: "hidden" });
    session.isSignedIn = false;
    await show({ activity: "hidden" });
    await show({ activity: "prev" });
    expect([guardRuns, replaced.length, instances]).toEqual([2, 0, 1]);
    expect(container.textContent).toBe("settings");

    await show({});
    expect(guardRuns).toBe(3);
    expect(replaced).toEqual(["/en/signin"]);
    expect(container.textContent).toBe("");
  });

  test("asks a chain page's guards again once it is back on screen, so a sign-out while it was parked moves on", async () => {
    const replaced = routerOf();
    const session = { isSignedIn: true };
    let guardRuns = 0;
    const inbox = page()
      .guard(() => {
        guardRuns += 1;
        if (!session.isSignedIn) router.replace("/signin");
      })
      .render(() => <p>inbox</p>)
      .toRouteModule();
    const inboxRender: RouteRender = {
      kind: "page",
      isAsync: true,
      render: inbox.default as never,
      guard: inbox.guard,
    };
    const pathRoute = { path: "/inbox", renderRootLayouts: [], renderLayouts: [], renderPage: inboxRender };
    const { container, show } = stackOf([inboxRender], pathRoute);

    await show({});
    await show({ activity: "hidden" });
    session.isSignedIn = false;
    await show({ activity: "prev" });
    expect([guardRuns, replaced.length]).toEqual([1, 0]);
    await show({});
    expect(guardRuns).toBe(2);
    expect(replaced).toEqual(["/en/signin"]);
    expect(container.textContent).toBe("");

    await show({ activity: "prev" });
    await show({});
    expect(guardRuns).toBe(3);
  });

  test("draws nothing of a refused page while it is asked again back in front, chain or legacy", async () => {
    const replaced = routerOf();
    const session = { isSignedIn: true };
    let answer: Promise<void> | null = null;
    let instances = 0;
    const guard = async () => {
      if (answer) await answer;
      if (!session.isSignedIn) router.replace("/signin");
    };
    const refuseAndReturn = async (renders: RouteRender[], pathRoute: { path: string }) => {
      session.isSignedIn = true;
      answer = null;
      const { container, show } = stackOf(renders, pathRoute);
      await show({});
      expect(container.textContent).not.toBe("");
      await show({ activity: "hidden" });
      session.isSignedIn = false;
      await show({});
      expect(container.textContent).toBe("");
      await show({ activity: "prev" });
      let answerNow: () => void = () => undefined;
      answer = new Promise<void>((resolve) => (answerNow = resolve));
      await show({});
      expect(container.textContent).toBe("");
      answerNow();
      await settle();
      expect(container.textContent).toBe("");
      const { root } = mounted as { root: Root };
      await act(async () => root.unmount());
      container.remove();
      mounted = null;
    };
    const inbox = page()
      .guard(guard)
      .render(() => <p>inbox</p>)
      .toRouteModule();
    const inboxRender: RouteRender = {
      kind: "page",
      isAsync: true,
      render: inbox.default as never,
      guard: inbox.guard,
    };
    await refuseAndReturn([inboxRender], {
      path: "/inbox-again",
      renderRootLayouts: [],
      renderLayouts: [],
      renderPage: inboxRender,
    } as never);
    const app = guardedLayoutOf(() => guard());
    const Notes = () => {
      useState(() => ++instances);
      return <p>notes</p>;
    };
    const notes: RouteRender = { kind: "page", render: Notes as RouteRender["render"] };
    await refuseAndReturn([notes], {
      path: "/notes-again",
      renderRootLayouts: [app],
      renderLayouts: [],
      renderPage: notes,
    } as never);
    expect(replaced).toEqual(["/en/signin", "/en/signin", "/en/signin", "/en/signin"]);
    expect(instances).toBe(1);
  });

  test("draws an unguarded page that first renders under the current one", async () => {
    routerOf();
    const home = page()
      .render(() => <p>home</p>)
      .toRouteModule();
    const homeRender: RouteRender = { kind: "page", isAsync: true, render: home.default as never };
    const pathRoute = { path: "/home", renderRootLayouts: [], renderLayouts: [], renderPage: homeRender };
    const { container, show } = stackOf([homeRender], pathRoute);
    await show({ activity: "prev" });
    expect(container.textContent).toBe("home");
  });

  test("draws nothing of another entry's props once a cached route's new entry is refused", async () => {
    const replaced = routerOf();
    const session = { isSignedIn: true };
    const app = layout()
      .guard(() => {
        if (!session.isSignedIn) router.replace("/signin");
      })
      .render(({ children }) => children)
      .toRouteModule();
    const appRender: RouteRender = { kind: "layout", isAsync: true, render: app.default as never, guard: app.guard };
    const Inbox = ({ searchParams }: { searchParams: Record<string, string> }) => (
      <p>{`inbox of ${searchParams.who}`}</p>
    );
    const legacy: RouteRender = { kind: "page", render: Inbox as RouteRender["render"] };
    const pathRoute = { path: "/inbox", renderRootLayouts: [appRender], renderLayouts: [], renderPage: legacy };
    const { container, show } = stackOf([legacy], pathRoute);

    await show({ searchParams: { who: "alice" } });
    expect(container.textContent).toBe("inbox of alice");
    session.isSignedIn = false;
    await show({ entryId: "e2", searchParams: { who: "bob" } });
    expect(replaced).toEqual(["/en/signin"]);
    expect(container.textContent).toBe("");
  });

  test("shows a background check that fails as a failed render, with a retry", async () => {
    routerOf();
    const server = { isBroken: false };
    const inbox = page()
      .guard(() => {
        if (server.isBroken) throw new Error("guard broke");
      })
      .render(() => <p>inbox</p>)
      .toRouteModule();
    const inboxRender: RouteRender = {
      kind: "page",
      isAsync: true,
      render: inbox.default as never,
      guard: inbox.guard,
    };
    const pathRoute = { path: "/inbox", renderRootLayouts: [], renderLayouts: [], renderPage: inboxRender };
    const { container, show } = stackOf([inboxRender], pathRoute);

    await show({});
    await show({ activity: "hidden" });
    server.isBroken = true;
    await show({});
    expect(container.querySelector("[role=alert]")).not.toBeNull();
    server.isBroken = false;
    await act(async () => container.querySelector("button")?.click());
    await settle();
    expect(container.textContent).toBe("inbox");
  });

  test("keeps a legacy page mounted with the props it was let in with while its next location is checked", async () => {
    routerOf();
    let admitOrg2: (() => void) | null = null;
    let instances = 0;
    const shell = layout()
      .param("orgId", String)
      .guard(async ({ orgId }) => {
        if (orgId === "2") await new Promise<void>((resolve) => (admitOrg2 = resolve));
      })
      .render(({ children }) => <main>{children}</main>)
      .toRouteModule();
    const shellRender: RouteRender = {
      kind: "layout",
      isAsync: true,
      render: shell.default as never,
      guard: shell.guard,
      paramNames: ["orgId"],
    };
    const Home = ({ params }: { params: Record<string, string> }) => {
      useState(() => ++instances);
      return <p>{`org ${params.orgId}`}</p>;
    };
    const legacy: RouteRender = { kind: "page", render: Home as RouteRender["render"] };
    const pathRoute = { path: "/org", renderRootLayouts: [], renderLayouts: [shellRender], renderPage: legacy };
    const { container, show } = stackOf([shellRender, legacy], pathRoute);

    await show({ params: { lang: "en", orgId: "1" } });
    expect(container.textContent).toBe("org 1");
    await show({ params: { lang: "en", orgId: "2" } });
    expect(container.textContent).toBe("org 1");
    (admitOrg2 as (() => void) | null)?.();
    await settle();
    expect(container.textContent).toBe("org 2");
    expect(instances).toBe(1);
  });

  test("asks a root layout's guard again when only a query it alone reads moves", async () => {
    const replaced = routerOf();
    let guardRuns = 0;
    const app = layout()
      .search("invite", String)
      .guard(({ invite }) => {
        guardRuns += 1;
        if (invite === "bad") router.notFound();
      })
      .render(({ children }) => children)
      .toRouteModule();
    const appRender: RouteRender = { kind: "layout", isAsync: true, render: app.default as never, guard: app.guard };
    const home = page()
      .render(() => <p>home</p>)
      .toRouteModule();
    const homeRender: RouteRender = { kind: "page", isAsync: true, render: home.default as never };
    const pathRoute = { path: "/home", renderRootLayouts: [appRender], renderLayouts: [], renderPage: homeRender };
    const { container, show } = stackOf([homeRender], pathRoute);

    await show({ searchParams: { invite: "ok" } });
    expect(container.textContent).toBe("home");
    await show({ searchParams: { invite: "bad" } });
    expect(guardRuns).toBe(2);
    expect(replaced).toEqual(["/en/404"]);
  });

  test("draws the next location after a layout's guard moved the router to a query only the page reads", async () => {
    const replaced = routerOf();
    let guardRuns = 0;
    const shell = guardedLayoutOf(() => {
      guardRuns += 1;
      if (guardRuns === 1) router.redirect("/notes?tab=all");
    });
    const notes = page()
      .search("tab", String)
      .render(({ tab }) => <p>{`notes ${tab}`}</p>)
      .toRouteModule();
    const notesRender: RouteRender = { kind: "page", isAsync: true, render: notes.default as never };
    const pathRoute = { path: "/notes", renderRootLayouts: [], renderLayouts: [shell], renderPage: notesRender };
    const { container, show } = stackOf([shell, notesRender], pathRoute);

    await show({});
    expect(replaced).toEqual(["/en/notes?tab=all"]);
    await show({ searchParams: { tab: "all" } });
    await settle();
    expect(container.textContent).toBe("notes all");
    expect(guardRuns).toBe(2);
  });

  test("runs a location's guards once under StrictMode", async () => {
    routerOf();
    let guardRuns = 0;
    const shell = guardedLayoutOf(() => {
      guardRuns += 1;
    });
    const home = page()
      .render(() => <p>home</p>)
      .toRouteModule();
    const homeRender: RouteRender = { kind: "page", isAsync: true, render: home.default as never };
    const pathRoute = { path: "/home", renderRootLayouts: [], renderLayouts: [shell], renderPage: homeRender };
    const { container, show } = stackOf([shell, homeRender], pathRoute);

    await show({ isStrict: true });
    expect(container.textContent).toBe("home");
    expect(guardRuns).toBe(1);
  });
});
