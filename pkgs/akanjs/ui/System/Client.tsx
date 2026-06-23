"use client";
import { type ClientEnv, dayjs, getEnv, logo } from "akanjs/base";
import {
  clearRscNavigationCache,
  clsx,
  Device,
  defaultPageState,
  fetch,
  getPathInfo,
  initAuth,
  type Location,
  navigateRsc,
  type PathRoute,
  pathContext,
  router,
  setCookie,
  type TransitionStyle,
  Translator,
  useCsr,
} from "akanjs/client";
import { Logger } from "akanjs/common";
import type { AkanTheme } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import { getBaseSearchParam, st } from "akanjs/store";
import { animated } from "akanjs/ui";
import {
  Children,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

import { Gtag } from "./Gtag";
import { Messages } from "./Messages";
import { Reconnect } from "./Reconnect";

export const Client = () => {
  return <></>;
};
interface ClientWrapperProps {
  children: ReactNode;
  theme?: AkanTheme;
  lang?: string;
  path?: string;
  dictionary?: Record<string, Record<string, unknown>>;
  signals?: SerializedSignal[];
  reconnect?: boolean;
}
export const ClientWrapper = ({
  children,
  theme,
  lang = "en",
  path,
  dictionary,
  signals = [],
  reconnect = true,
}: ClientWrapperProps) => {
  // Seed the active locale into the shared Translator before children render.
  // SSR provides the active-locale dictionary as a prop (serialized via the RSC Flight payload);
  // this runs in both the SSR render process and the browser, so the first paint is translated
  // without shipping every locale in the client JS bundle. CSR seeds via the build-time macro instead.
  if (dictionary) {
    Translator.seed(lang, dictionary);
    // On the browser, record the server-resolved locale as the source of truth for usePage()/l().
    // This keeps client lookups aligned with the seeded + server-rendered locale (no hydration
    // mismatch) for base-path / cloud routing where the URL segment is not a reliable locale.
    // Skipped on the server (typeof window === "undefined") where locale is request-scoped.
    Translator.setActiveLocale(lang);
  }
  Translator.setActivePath(path);
  useEffect(() => {
    Translator.markHydrated();
  }, [path]);
  useLayoutEffect(() => {
    Logger.rawLog(logo);
  }, []);
  return (
    <>
      {/* <ThemeProvider defaultTheme={theme}> */}
      {Children.toArray(children)}
      {reconnect ? <Reconnect key="reconnect" /> : null}
    </>
  );
};
Client.Wrapper = ClientWrapper;

interface ClientPathWrapperProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  bind?: () => HTMLAttributes<HTMLDivElement>;
  wrapperRef?: RefObject<HTMLDivElement | null> | null;
  pageType?: "current" | "prev" | "cached";
  location?: Location;
  initialHref?: string;
  initialPath?: string;
  initialPathname?: string;
  initialParams?: Record<string, string>;
  initialSearch?: string;
  initialSearchParams?: Record<string, string | string[]>;
  initialHash?: string;
  style?: TransitionStyle;
  prefix?: string;
  children?: ReactNode;
  layoutStyle?: "web" | "mobile";
}
export const ClientPathWrapper = ({
  className,
  bind,
  wrapperRef,
  pageType = "current",
  location,
  initialHref,
  initialPath,
  initialPathname,
  initialParams,
  initialSearch,
  initialSearchParams,
  initialHash,
  prefix = "",
  children,
  layoutStyle = "web",
  ...props
}: ClientPathWrapperProps) => {
  const href = location?.href ?? initialHref ?? (typeof window !== "undefined" ? window.location.href : "");
  const hash = location?.hash ?? initialHash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const pathname = location?.pathname ?? initialPathname ?? "/"; // ?? usePathname();
  const params = location?.params ?? initialParams ?? {}; // ?? (useParams() as unknown as Record<string, string>);
  const searchParams = location?.searchParams ?? initialSearchParams ?? {}; //?? Object.fromEntries(useSearchParams());
  const search = location?.search ?? initialSearch ?? (typeof window !== "undefined" ? window.location.search : "");
  const lang = params.lang;
  const firstPath = pathname.split("/")[2];
  const pathRoute: PathRoute = location?.pathRoute ?? {
    path: initialPath ?? `/${pathname.split("/").slice(2).join("/")}`,
    pathSegments: (initialPath ?? `/${pathname.split("/").slice(2).join("/")}`).split("/").filter(Boolean),
    renderPage: { render: () => <></> },
    pageState: defaultPageState,
    renderRootLayouts: [],
    renderLayouts: [],
  };
  const csr = useCsr();
  const registerFrameSlot =
    typeof csr.registerFrameSlot === "function"
      ? (slot: Parameters<typeof csr.registerFrameSlot>[1]) => csr.registerFrameSlot(pathRoute.path, slot)
      : () => () => undefined;

  // const { initialize, codepush, statManager } = useCodepush({ serverUrl: process.env.AKAN_PUBLIC_SERVER_URL ?? "" });

  const [gestureEnabled, setGestureEnabled] = useState(true);
  // useEffect(() => {
  //   void initialize();
  //   void codepush();
  //   void statManager();
  // }, []);
  return (
    <pathContext.Provider
      value={{
        pageType,
        location: {
          href,
          hash,
          pathname,
          params,
          searchParams,
          search,
          pathRoute,
        },
        prefix,
        gestureEnabled,
        setGestureEnabled,
        registerFrameSlot,
      }}
    >
      <animated.div
        {...(bind && pathRoute.pageState.gesture && gestureEnabled ? bind() : {})}
        className={clsx("group/path", className)}
        ref={wrapperRef}
        {...props}
        data-lang={lang}
        data-basepath={prefix}
        data-firstpath={firstPath}
      >
        {children}
      </animated.div>
    </pathContext.Provider>
  );
};

interface ClientBridgeProps {
  env: ClientEnv;
  lang?: string;
  theme?: AkanTheme;
  prefix?: string;
  gaTrackingId?: string;
  wsConnect?: boolean;
}

export const ClientBridge = ({ env, lang, theme, prefix, gaTrackingId, wsConnect = true }: ClientBridgeProps) => {
  const uiOperation = st.use.uiOperation();
  const pathname = st.use.pathname();
  const params = st.use.params();
  const searchParams = st.use.searchParams();
  const language = (params.lang as string | undefined) ?? lang;
  const path = `/${pathname.split("/").slice(2).join("/")}`;
  // const { setTheme, themes, theme: nextTheme } = useTheme();
  useEffect(() => {
    if (uiOperation !== "sleep") return;
    // const initTheme = async () => {
    //   console.log("initTheme1", theme);
    //   if (theme) {
    //     setTheme(theme);
    //     return;
    //   }
    //   const localTheme = await storage.getItem("theme");
    //   console.log("localTheme2", localTheme);
    //   if (typeof localTheme === "string" && themes.includes(localTheme)) {
    //     console.log("setTheme3", localTheme);
    //     setTheme(localTheme);
    //   } else setTheme("system");
    // };

    // void initTheme();
    setCookie("siteurl", window.location.origin);
    dayjs.locale(language);
    initAuth({ jwt: getBaseSearchParam(searchParams, "jwt") });
    st.set({ uiOperation: "loading" });
    setTimeout(() => {
      st.set({ uiOperation: "idle" });
    }, 2000);
  }, []);

  useEffect(() => {
    if (!wsConnect) return;
    (fetch.instance as { connect: () => void }).connect();
  }, [wsConnect]);

  useEffect(() => {
    if (getThemeCookie() !== undefined) return;
    applyThemePolicy(theme ?? "system");
  }, [theme]);

  // useEffect(() => {
  //   if (storeTheme !== nextTheme) setTheme(storeTheme);
  // }, [nextTheme]);

  useEffect(() => {
    //theme가 잇으면 theme부터
    //theme가 있는데 nextTheme가 있으면
    // if (nextTheme) setTheme(nextTheme);
    // else if (theme) setTheme(theme);
  }, []);

  useEffect(() => {
    const devMode = localStorage.getItem("devMode");
    if (devMode) st.do.setDevMode(devMode === "true");
  }, []);

  useEffect(() => {
    if (uiOperation !== "sleep") return;
    const handleResize = () => {
      st.do.setWindowSize();
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    setCookie("path", path);
    Logger.log(`pathChange-finished:${path}`);
  }, [pathname]);
  return gaTrackingId && <Gtag trackingId={gaTrackingId} />;
};
Client.Bridge = ClientBridge;

function getThemeCookie(): string | undefined {
  return document.cookie
    .split(";")
    .find((cookie) => cookie.trim().startsWith("theme="))
    ?.split("=")[1];
}

function applyThemePolicy(theme: AkanTheme): void {
  if (theme === "css") {
    document.documentElement.removeAttribute("data-theme");
    return;
  }
  if (theme === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    return;
  }
  document.documentElement.setAttribute("data-theme", theme);
}

function buildSearchParams(entries: Iterable<[string, string]>): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of entries) {
    const current = params[key];
    if (current === undefined) params[key] = value;
    else params[key] = Array.isArray(current) ? [...current, value] : [current, value];
  }
  return params;
}

export const ClientInner = () => {
  const uiOperation = st.use.uiOperation();
  return (
    <>
      <div key="modal-root" id="modal-root" />
      {uiOperation === "idle" ? <Messages key="messages" /> : null}
    </>
  );
};
Client.Inner = ClientInner;

interface ClientSsrBridgeProps {
  lang: string;
  prefix?: string;
}
export const ClientSsrBridge = ({ lang, prefix = "" }: ClientSsrBridgeProps) => {
  useEffect(() => {
    const visiblePrefix = getEnv().operationMode === "local" ? prefix : "";
    const navigateRscWithFallback = (
      href: string,
      routeOptions: Parameters<typeof navigateRsc>[1],
      fallback: () => void,
    ) => {
      const navigation = navigateRsc(href, routeOptions);
      if (!navigation) {
        fallback();
        return;
      }
      void navigation.catch((error) => {
        Logger.warn(`RSC navigation failed, falling back to document navigation: ${String(error)}`);
        fallback();
      });
    };
    const syncHref = (href: string) => {
      const url = new URL(href, window.location.origin);
      const { path } = getPathInfo(`${url.pathname}${url.search}${url.hash}`, lang, visiblePrefix);
      const searchParams = buildSearchParams(url.searchParams.entries());
      st.set({ pathname: url.pathname, path, searchParams });
    };
    router.init({
      type: "ssr",
      side: "client",
      lang,
      prefix,
      router: {
        push: (href, routeOptions) => {
          syncHref(href);
          navigateRscWithFallback(href, routeOptions, () => window.location.assign(href));
        },
        replace: (href, routeOptions) => {
          syncHref(href);
          navigateRscWithFallback(href, { ...routeOptions, replace: true }, () => window.location.replace(href));
        },
        back: () => {
          window.history.back();
        },
        refresh: () => {
          clearRscNavigationCache();
          syncHref(window.location.href);
          void navigateRsc(window.location.href, {
            replace: true,
            scrollToTop: false,
          });
        },
      },
    });
    void Device.load({ lang });
  }, [lang, prefix]);

  useEffect(() => {
    const visiblePrefix = getEnv().operationMode === "local" ? prefix : "";
    const sync = () => {
      const { pathname, search, hash } = window.location;
      const { path } = getPathInfo(`${pathname}${search}${hash}`, lang, visiblePrefix);
      const searchParams = buildSearchParams(new URLSearchParams(search).entries());
      st.set({ pathname: window.location.pathname, path, searchParams });
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [lang, prefix]);
  return null;
};
Client.SsrBridge = ClientSsrBridge;
