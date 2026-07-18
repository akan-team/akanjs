import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Location, PathRoute, RouteGuide } from "akanjs/client";
import { createRobotPage } from "./createRobotPage";
import { createSitemapPage } from "./createSitemapPage";

type RenderHookResult<T> = {
  get current(): T;
  rerender: (props?: unknown) => void;
  unmount: () => void;
};

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
const effectCleanups: Array<() => void> = [];
const reactLazyLoaders: Array<() => Promise<unknown>> = [];
let hookIndex = 0;
const hookStates: unknown[] = [];
let hookMemoStates: Array<{ deps: unknown[]; value: unknown }> = [];
let hookEffectStates: Array<{ deps: unknown[] | undefined; cleanup?: () => undefined }> = [];

const sameDeps = (a: unknown[] | undefined, b: unknown[] | undefined) =>
  !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

mock.module("react", () => ({
  Fragment: ({ children }: { children: unknown }) => children,
  useCallback: <T,>(fn: T, deps?: unknown[]) => {
    const index = hookIndex++;
    const memo = hookMemoStates[index];
    if (memo && sameDeps(memo.deps, deps)) return memo.value as T;
    hookMemoStates[index] = { deps: deps ?? [], value: fn };
    return fn;
  },
  useMemo: <T,>(factory: () => T, deps?: unknown[]) => {
    const index = hookIndex++;
    const memo = hookMemoStates[index];
    if (memo && sameDeps(memo.deps, deps)) return memo.value as T;
    const value = factory();
    hookMemoStates[index] = { deps: deps ?? [], value };
    return value;
  },
  useRef: <T,>(initial: T) => {
    const index = hookIndex++;
    if (!hookStates[index]) hookStates[index] = { current: initial };
    return hookStates[index] as { current: T };
  },
  useState: <T,>(initial: T) => {
    const index = hookIndex++;
    if (hookStates[index] === undefined)
      hookStates[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    const setState = (next: T | ((prev: T) => T)) => {
      const state = hookStates[index] as T;
      const nextState = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      if (typeof state === "object" && state && typeof nextState === "object" && nextState) {
        Object.assign(state, nextState);
      } else {
        hookStates[index] = nextState;
      }
    };
    return [hookStates[index] as T, setState] as const;
  },
  useEffect: (fn: () => (() => undefined) | undefined, deps?: unknown[]) => {
    const index = hookIndex++;
    const prev = hookEffectStates[index];
    if (prev && sameDeps(prev.deps, deps)) return;
    prev?.cleanup?.();
    const cleanup = fn();
    hookEffectStates[index] = { deps, cleanup: cleanup || undefined };
    if (cleanup) effectCleanups.push(cleanup);
  },
  forwardRef: (fn: unknown) => fn,
  lazy: (loader: () => Promise<unknown>) => {
    reactLazyLoaders.push(loader);
    return { loader };
  },
  memo: <T,>(component: T) => component,
  act: async (fn: () => void | Promise<void>) => await fn(),
}));
mock.module("react/jsx-dev-runtime", () => ({
  Fragment: ({ children }: { children: unknown }) => children,
  jsxDEV: (_type: unknown, props: { children?: unknown }) => props.children ?? null,
}));
mock.module("react/jsx-runtime", () => ({
  Fragment: ({ children }: { children: unknown }) => children,
  jsx: (_type: unknown, props: { children?: unknown }) => props.children ?? null,
  jsxs: (_type: unknown, props: { children?: unknown }) => props.children ?? null,
}));

const installWindow = ({
  href = "https://example.test/en/home?tab=a#hash",
  assign,
  replace,
  getElementById,
}: {
  href?: string;
  assign?: (href: string) => void;
  replace?: (href: string) => void;
  getElementById?: (id: string) => { offsetTop: number } | null;
} = {}) => {
  const url = new URL(href);
  const createElement = (tagName = "div") =>
    ({
      nodeType: 1,
      nodeName: tagName.toUpperCase(),
      tagName: tagName.toUpperCase(),
      namespaceURI: "http://www.w3.org/1999/xhtml",
      ownerDocument: null,
      style: {},
      childNodes: [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      appendChild: () => undefined,
      removeChild: () => undefined,
      insertBefore: () => undefined,
      setAttribute: () => undefined,
      removeAttribute: () => undefined,
    }) as unknown as HTMLDivElement;
  const body = { style: {} } as HTMLBodyElement;
  const document = {
    nodeType: 9,
    body,
    documentElement: createElement("html"),
    defaultView: null,
    createElement,
    getElementById: getElementById ?? (() => null),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Document;
  (document.documentElement as unknown as { ownerDocument: Document }).ownerDocument = document;
  const window = {
    location: {
      href,
      origin: url.origin,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      assign: assign ?? (() => undefined),
      replace: replace ?? (() => undefined),
    },
    document,
    HTMLIFrameElement: class HTMLIFrameElement {},
    Node: class Node {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as Window & typeof globalThis;
  (document as unknown as { defaultView: Window }).defaultView = window;

  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  Object.defineProperty(globalThis, "location", { value: window.location, configurable: true });
  return { window, document };
};

const renderHook = <T,>(hook: (props?: unknown) => T, initialProps?: unknown): RenderHookResult<T> => {
  let current: T;
  const render = (props?: unknown) => {
    hookIndex = 0;
    current = hook(props);
  };
  render(initialProps);
  return {
    get current() {
      return current;
    },
    rerender: render,
    unmount: () => {
      effectCleanups.splice(0).forEach((cleanup) => {
        cleanup();
      });
      hookIndex = 0;
      hookStates.length = 0;
      hookMemoStates = [];
      hookEffectStates = [];
    },
  };
};

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

class TimerController {
  private nextId = 1;
  private timeouts = new Map<number, { handler: () => void; delay: number }>();
  private intervals = new Map<number, { handler: () => void; delay: number }>();

  install() {
    globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      const id = this.nextId++;
      this.timeouts.set(id, {
        handler: () => {
          if (typeof handler === "function") handler(...args);
        },
        delay: delay ?? 0,
      });
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
      this.timeouts.delete(Number(id));
    }) as typeof clearTimeout;
    globalThis.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      const id = this.nextId++;
      this.intervals.set(id, {
        handler: () => {
          if (typeof handler === "function") handler(...args);
        },
        delay: delay ?? 0,
      });
      return id as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;
    globalThis.clearInterval = ((id?: ReturnType<typeof setInterval>) => {
      this.intervals.delete(Number(id));
    }) as typeof clearInterval;
  }

  flushTimeouts() {
    const pending = [...this.timeouts.entries()];
    this.timeouts.clear();
    pending.forEach(([, timer]) => {
      timer.handler();
    });
  }

  tickIntervals() {
    [...this.intervals.values()].forEach((timer) => {
      timer.handler();
    });
  }

  get timeoutCount() {
    return this.timeouts.size;
  }

  get intervalCount() {
    return this.intervals.size;
  }
}

const makePathRoute = (path: string, pathSegments: string[], cache = false): PathRoute =>
  ({
    path,
    pathSegments,
    renderPage: { render: () => null },
    renderRootLayouts: [],
    renderLayouts: [],
    pageState: {
      transition: "none",
      topSafeArea: 0,
      bottomSafeArea: 0,
      topInset: 0,
      bottomInset: 0,
      gesture: true,
      cache,
    },
  }) as unknown as PathRoute;

const homeRoute = makePathRoute("/en/home", ["/", "/en", "/home"], true);
const detailRoute = makePathRoute("/en/items/:id", ["/", "/en", "/items", "/:id"], true);
const rootRouteGuide: RouteGuide = {
  pathSegment: "/",
  children: {
    "/en": {
      pathSegment: "/en",
      children: {
        "/home": { pathSegment: "/home", children: {}, pathRoute: homeRoute },
        "/items": {
          pathSegment: "/items",
          children: {
            "/:id": { pathSegment: "/:id", children: {}, pathRoute: detailRoute },
          },
        },
      },
    },
  },
};

afterEach(() => {
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
  Object.defineProperty(globalThis, "location", { value: originalWindow?.location, configurable: true });
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
  effectCleanups.splice(0);
  reactLazyLoaders.length = 0;
  hookIndex = 0;
  hookStates.length = 0;
  hookMemoStates = [];
  hookEffectStates = [];
});

describe("page helpers", () => {
  test("creates robots config with defaults and overrides", () => {
    expect(createRobotPage("https://example.test")).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/admin/" },
      sitemap: "https://example.test/sitemap.xml",
    });
    expect(
      createRobotPage("https://example.test", {
        rules: { userAgent: "Googlebot", allow: "/public", disallow: "/private" },
        sitemap: "https://ignored.test/custom.xml",
      }),
    ).toEqual({
      rules: { userAgent: "Googlebot", allow: "/public", disallow: "/private" },
      sitemap: "https://example.test/sitemap.xml",
    });
  });

  test("creates sitemap pages with shared lastModified", () => {
    const sitemap = createSitemapPage("https://example.test", ["/", "/about"]);

    expect(sitemap.map((entry) => entry.url)).toEqual(["https://example.test/", "https://example.test/about"]);
    expect(sitemap[0]?.lastModified).toBeInstanceOf(Date);
    expect(sitemap[0]?.lastModified).toBe(sitemap[1]?.lastModified);
  });
});

describe("routing and history hooks", () => {
  test("useLocation parses static, dynamic, query array, hash, and absolute hrefs", async () => {
    const { useLocation } = await import("./useLocation");
    installWindow({ href: "https://example.test/en/home" });
    const hook = renderHook(() => useLocation({ rootRouteGuide }));

    const home = hook.current.getLocation("https://example.test/en/home?tab=a&tab=b#section");
    const detail = hook.current.getLocation("/en/items/123?mode=edit");

    expect(home).toMatchObject({
      pathname: "/en/home",
      search: "tab=a&tab=b",
      searchParams: { tab: ["a", "b"] },
      hash: "section",
      pathRoute: homeRoute,
    });
    expect(detail).toMatchObject({
      pathname: "/en/items/123",
      params: { id: "123" },
      searchParams: { mode: "edit" },
      pathRoute: detailRoute,
    });
    hook.unmount();
  });

  test("useLocation redirects missing route to 404", async () => {
    const { useLocation } = await import("./useLocation");
    const assigned: string[] = [];
    installWindow({ assign: (href) => assigned.push(href) });
    const hook = renderHook(() => useLocation({ rootRouteGuide }));

    expect(() => hook.current.getLocation("/en/missing")).toThrow("Not found: /en/missing");
    expect(assigned).toEqual([]);
    hook.unmount();
  });

  test("useHistory tracks forward/back state, caches route locations, and reads hash scroll", async () => {
    const { useHistory } = await import("./useHistory");
    installWindow({
      href: "https://example.test/en/home",
      getElementById: (id) => (id === "target" ? { offsetTop: 77 } : null),
    });
    const firstLocation = {
      href: "/en/home",
      pathname: "/en/home",
      hash: "",
      pathRoute: homeRoute,
    } as Location;
    const secondLocation = {
      href: "/en/items/1",
      pathname: "/en/items/1",
      hash: "",
      pathRoute: detailRoute,
    } as Location;
    const hashLocation = {
      href: "/en/items/1#target",
      pathname: "/en/items/1",
      hash: "target",
      pathRoute: detailRoute,
    } as Location;
    const hook = renderHook(() => useHistory([firstLocation]));

    expect(hook.current.getCurrentLocation()).toBe(firstLocation);
    hook.current.setHistoryForward({ type: "push", location: secondLocation, scrollTop: 30 });
    expect(hook.current.history.current.type).toBe("forward");
    expect(hook.current.history.current.idx).toBe(1);
    expect(hook.current.getPrevLocation()).toBe(firstLocation);
    expect(hook.current.history.current.cachedLocationMap.get(detailRoute.path)).toBe(secondLocation);
    expect(hook.current.getScrollTop(firstLocation)).toBe(30);

    const replacement = { ...secondLocation, href: "/en/items/2" } as Location;
    hook.current.setHistoryForward({ type: "replace", location: replacement, scrollToTop: true });
    expect(hook.current.history.current.locations.at(-1)).toBe(replacement);
    expect(hook.current.history.current.idx).toBe(1);

    hook.current.setHistoryBack({ type: "back", location: replacement, scrollTop: 55 });
    expect(hook.current.history.current.type).toBe("back");
    expect(hook.current.history.current.idx).toBe(0);
    expect(hook.current.getNextLocation()).toBe(replacement);
    expect(hook.current.getScrollTop(hashLocation)).toBe(77);
    hook.unmount();
  });
});

describe("promise and timer hooks", () => {
  test("useFetch handles immediate values and resolved promises", async () => {
    const { useFetch } = await import("./useFetch");
    installWindow();
    const immediate = renderHook(() => useFetch("ready"));
    expect(immediate.current).toEqual({ fulfilled: true, value: "ready" });
    immediate.unmount();

    const promise = Promise.resolve("done");
    const hook = renderHook(() => useFetch(promise));
    expect(hook.current).toEqual({ fulfilled: false, value: null });
    await tick();
    expect(hook.current).toEqual({ fulfilled: true, value: "done" });
    hook.unmount();
  });

  test("useFetch cancels updates on unmount and formats errors", async () => {
    const { useFetch } = await import("./useFetch");
    installWindow();
    let resolvePromise: (value: string) => void = () => undefined;
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });
    const cancelled = renderHook(() => useFetch(promise));
    cancelled.unmount();
    resolvePromise("late");
    await tick();
    expect(cancelled.current).toEqual({ fulfilled: false, value: null });

    const errors: string[] = [];
    const rejection = Promise.reject(new Error("boom"));
    rejection.catch(() => undefined);
    expect(() => renderHook(() => useFetch(rejection, { onError: (error) => errors.push(error) }))).not.toThrow();
    await tick();
    expect(errors).toEqual(["Error: boom"]);
  });

  test("useFetchFn memoizes factory by dependencies", async () => {
    const { useFetchFn } = await import("./useFetch");
    installWindow();
    let calls = 0;
    const hook = renderHook(
      (dep) =>
        useFetchFn(() => {
          calls += 1;
          return `value:${dep}`;
        }, [dep]),
      "a",
    );

    expect(hook.current).toEqual({ fulfilled: true, value: "value:a" });
    hook.rerender("a");
    expect(calls).toBe(1);
    hook.rerender("b");
    expect(hook.current).toEqual({ fulfilled: true, value: "value:b" });
    expect(calls).toBe(2);
    hook.unmount();
  });

  test("debounce, throttle, and interval hooks use timers correctly", async () => {
    const { useDebounce } = await import("./useDebounce");
    const { useInterval } = await import("./useInterval");
    const { useThrottle } = await import("./useThrottle");
    installWindow();
    const timers = new TimerController();
    timers.install();
    const debouncedValues: string[] = [];
    const throttledValues: string[] = [];
    const intervalValues: string[] = [];

    const debounceHook = renderHook(() => useDebounce((value: string) => debouncedValues.push(value), [], 100));
    debounceHook.current("a");
    debounceHook.current("b");
    expect(timers.timeoutCount).toBe(1);
    timers.flushTimeouts();
    expect(debouncedValues).toEqual(["b"]);
    debounceHook.unmount();

    const throttleHook = renderHook(() => useThrottle((value: string) => throttledValues.push(value), 100, []));
    throttleHook.current("a");
    throttleHook.current("b");
    expect(throttledValues).toEqual(["a"]);
    timers.flushTimeouts();
    throttleHook.current("c");
    expect(throttledValues).toEqual(["a", "c"]);
    throttleHook.unmount();

    let intervalLabel = "first";
    const intervalHook = renderHook(() => useInterval(() => intervalValues.push(intervalLabel), 100));
    timers.tickIntervals();
    intervalLabel = "second";
    intervalHook.rerender();
    timers.tickIntervals();
    expect(intervalValues).toEqual(["first", "second"]);
    intervalHook.unmount();
    expect(timers.intervalCount).toBe(0);
  });
});

describe("lazy loading", () => {
  test("returns server fallback stub for ssr false without invoking loader", async () => {
    const { lazy } = await import("./lazy");
    installWindow();
    Object.defineProperty(globalThis, "window", { value: undefined, configurable: true });
    let loaded = false;
    const LazyComponent = lazy(
      async () => {
        loaded = true;
        return { default: () => "Loaded" };
      },
      { ssr: false, loading: () => "Loading" },
    ) as (props: Record<string, unknown>) => unknown;

    expect(loaded).toBe(false);
    expect(LazyComponent({})).toBeDefined();
  });

  test("returns wrappers for default and client ssr false paths", async () => {
    const { lazy } = await import("./lazy");
    installWindow();
    const DefaultLazy = lazy(async () => ({ default: () => "Loaded" })) as { displayName?: string };
    const ClientGate = lazy(async () => ({ default: () => "Loaded" }), {
      ssr: false,
      loading: () => "Loading",
    }) as { displayName?: string };

    expect(DefaultLazy.displayName).toBe("LazyWrapper");
    expect(ClientGate.displayName).toBe("LazySsrFalseStub");
  });

  test("normalizes direct component loader results for React lazy", async () => {
    const { lazy } = await import("./lazy");
    installWindow();
    const Loaded = () => "Loaded";

    lazy(async () => Loaded);

    const loader = reactLazyLoaders.at(-1);
    expect(loader).toBeDefined();
    await expect(loader?.()).resolves.toEqual({ default: Loaded });
  });
});
