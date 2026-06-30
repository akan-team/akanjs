import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalEnv = { ...process.env };

const deviceState = {
  lang: "en",
  platform: "web",
};
const storageState = {
  jwt: null as string | null,
};

const setRequiredEnv = () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME = "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akanjs.com";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
};

beforeAll(() => {
  setRequiredEnv();
  mock.module("akanjs/client", () => ({
    DEFAULT_BOTTOM_INSET: 34,
    DEFAULT_TOP_INSET: 44,
    csrContext: { Provider: ({ children }: { children: unknown }) => children },
    defaultPageState: {
      transition: "none",
      topSafeArea: 0,
      bottomSafeArea: 0,
      topInset: 0,
      bottomInset: 0,
      gesture: true,
      cache: false,
    },
    router: {
      state: {},
      set: () => undefined,
      emit: () => undefined,
      on: () => undefined,
      off: () => undefined,
    },
    Device: {
      load: async () => ({
        lang: deviceState.lang,
        info: { platform: deviceState.platform },
        topSafeArea: 11,
        bottomSafeArea: 22,
      }),
      getDevice: () => ({
        info: { platform: deviceState.platform },
      }),
    },
    Translator: {
      getActiveLocale: () => undefined,
      getActivePath: () => undefined,
      hydrateMacroTranslations: () => undefined,
      isHydrated: () => true,
      markHydrated: () => undefined,
      seed: () => undefined,
      setActiveLocale: () => undefined,
      setActivePath: () => undefined,
    },
    getExplicitPageConfigKeys: () => ({}),
    normalizeDeepLinkHref: (href: string) => href,
    getPathInfo: (requestUrl: string, lang: string, prefix: string) => {
      const [urlWithoutHash, hash = ""] = requestUrl.split("#");
      const [url, search = ""] = urlWithoutHash.split("?");
      const langLength = lang.length + 1;
      const pathWithSubRoute = url === `/${lang}` ? "/" : url.startsWith(`/${lang}/`) ? url.slice(langLength) : url;
      const prefixLength = prefix ? prefix.length + 1 : 0;
      const path = !prefixLength
        ? pathWithSubRoute
        : pathWithSubRoute === `/${prefix}`
          ? "/"
          : pathWithSubRoute.startsWith(`/${prefix}`)
            ? pathWithSubRoute.slice(prefixLength)
            : pathWithSubRoute;
      const subRoute = prefix ? `/${prefix}` : "";
      const pathname = path.startsWith("http")
        ? path
        : path === "/"
          ? `/${lang}${subRoute}`
          : `/${lang}${subRoute}${path}`;
      const href = `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
      return { path, pathname, hash, search, href };
    },
    debugFrame: () => undefined,
    initAuth: () => undefined,
    readCssSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
    resolvePageState: ({
      configChain = [],
      platform,
    }: {
      configChain?: Array<{
        transition?: string;
        safeArea?: boolean;
        topInset?: number;
        bottomInset?: number;
      }>;
      platform: string;
    }) => {
      const config = Object.assign({}, ...configChain);
      return {
        transition: config.transition ?? "none",
        topSafeArea: config.safeArea === false || platform === "android" ? 0 : 11,
        bottomSafeArea: config.safeArea === false || platform === "android" ? 0 : 22,
        topInset: config.topInset ?? 0,
        bottomInset: config.bottomInset ?? 0,
        gesture: true,
        cache: false,
      };
    },
    storage: {
      getItem: async (key: string) => (key === "jwt" ? storageState.jwt : null),
    },
    validatePageConfig: () => undefined,
  }));
  mock.module("react-dom/client", () => ({
    createRoot: () => ({ render: () => undefined }),
  }));
  mock.module("@capacitor/app", () => ({
    App: {
      addListener: () => ({ remove: () => undefined }),
    },
  }));
  mock.module("@react-spring/web", () => ({
    useSpringValue: () => ({ to: () => 0, start: async () => undefined }),
  }));
  mock.module("@use-gesture/react", () => ({
    useDrag: () => () => ({}),
  }));
});

const installWindow = ({
  href,
  replace,
  root = true,
}: {
  href: string;
  replace?: (href: string) => void;
  root?: boolean;
}) => {
  const url = new URL(href);
  const body = { style: {} } as HTMLBodyElement;
  const document = {
    body,
    getElementById: (id: string) => (root && id === "root" ? ({ nodeType: 1 } as HTMLElement) : null),
  } as unknown as Document;
  const window = {
    document,
    location: {
      href,
      origin: url.origin,
      host: url.host,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      replace: replace ?? (() => undefined),
    },
  } as unknown as Window & typeof globalThis;
  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  Object.defineProperty(globalThis, "location", { value: window.location, configurable: true });
};

afterEach(() => {
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
  Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
  Object.defineProperty(globalThis, "location", { value: originalWindow?.location, configurable: true });
  process.env = { ...originalEnv };
  setRequiredEnv();
  deviceState.lang = "en";
  deviceState.platform = "web";
  storageState.jwt = null;
});

describe("bootCsr", () => {
  test("exits early on 404 before route loading", async () => {
    installWindow({ href: "https://example.test/404" });
    let loaded = false;
    const { bootCsr } = await import("./bootCsr");

    await bootCsr({
      "./_index.tsx": async () => {
        loaded = true;
        return { default: () => null };
      },
    });

    expect(loaded).toBe(false);
    expect(document.body.style.overflow).toBe("hidden");
  });

  test("redirects to language-prefixed path when missing language prefix", async () => {
    const replacements: string[] = [];
    installWindow({ href: "https://example.test/home?a=1#top", replace: (href) => replacements.push(href) });
    const { bootCsr } = await import("./bootCsr");

    await bootCsr({
      "./_index.tsx": async () => ({ default: () => null }),
    });

    expect(replacements).toEqual(["/en/home?a=1#top"]);
  });

  test("initializes mobile target from local Capacitor CSR URL", async () => {
    const replacements: string[] = [];
    installWindow({
      href: "https://example.test/en/?csr=true&akanMobileTarget=default&akanMobileBasePath=minimal&akanMobileIndexPath=/explore",
      replace: (href) => replacements.push(href),
    });
    const { bootCsr } = await import("./bootCsr");

    await bootCsr({
      "./_index.tsx": async () => ({ default: () => null }),
    });

    expect(window.__AKAN_MOBILE_TARGET__).toEqual({ name: "default", basePath: "minimal", indexPath: "/explore" });
    expect(replacements).toEqual([]);
  });
});
