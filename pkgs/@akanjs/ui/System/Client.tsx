"use client";
import type { BaseClientEnv } from "@akanjs/base";
import { baseClientEnv, dayjs, logo } from "@akanjs/base";
import {
  clsx,
  defaultPageState,
  device,
  getPathInfo,
  initAuth,
  type Location,
  pathContext,
  type PathRoute,
  router,
  type RouterInstance,
  setCookie,
  type TransitionStyle,
} from "@akanjs/client";
import { Logger } from "@akanjs/common";
import { constantInfo } from "@akanjs/constant";
import { serverTranslator } from "@akanjs/dictionary";
import { SerializedSignal, signalInfo } from "@akanjs/signal";
import { baseSt, st, storeInfo } from "@akanjs/store";
import { animated } from "@akanjs/ui";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { HTMLAttributes, RefObject, useEffect, useLayoutEffect, useState } from "react";

import { Gtag } from "./Gtag";
import { Messages } from "./Messages";
import { Reconnect } from "./Reconnect";

export const Client = () => {
  return <></>;
};
interface ClientWrapperProps {
  children: any;
  theme?: string;
  lang?: string;
  dictionary?: { [key: string]: { [key: string]: string } };
  signals?: SerializedSignal[];
  reconnect?: boolean;
}
export const ClientWrapper = ({
  children,
  theme,
  lang = "en",
  dictionary = {},
  signals = [],
  reconnect = true,
}: ClientWrapperProps) => {
  if (baseClientEnv.renderMode === "ssr") {
    if (!serverTranslator.hasTranslator(lang)) serverTranslator.setTranslator(lang, dictionary);
    (global as unknown as { builtFetch?: typeof global.builtFetch }).builtFetch ??= signalInfo.buildFetch(
      signals
    ) as unknown as typeof global.builtFetch;
    if (!(baseSt as unknown as { use?: object }).use) storeInfo.buildStore(signals);
  }
  useLayoutEffect(() => {
    Logger.rawLog(logo);
  }, []);
  return (
    <ThemeProvider defaultTheme={theme}>
      {children}
      {reconnect ? <Reconnect /> : null}
    </ThemeProvider>
  );
};
Client.Wrapper = ClientWrapper;

interface ClientPathWrapperProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  bind?: () => any;
  wrapperRef?: RefObject<HTMLDivElement | null> | null;
  pageType?: "current" | "prev" | "cached";
  location?: Location;
  style?: TransitionStyle;
  prefix?: string;
  children?: any;
  layoutStyle?: "web" | "mobile";
}
export const ClientPathWrapper = ({
  className,
  bind,
  wrapperRef,
  pageType = "current",
  location,
  prefix = "",
  children,
  layoutStyle = "web",
  ...props
}: ClientPathWrapperProps) => {
  const href = location?.href ?? (typeof window !== "undefined" ? window.location.href : "");
  const hash = location?.hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const pathname = location?.pathname ?? usePathname();
  const params = location?.params ?? (useParams() as unknown as Record<string, string>);
  const searchParams = location?.searchParams ?? Object.fromEntries(useSearchParams());
  const search = location?.search ?? (typeof window !== "undefined" ? window.location.search : "");
  const lang = params.lang;
  const firstPath = pathname.split("/")[2];
  const pathRoute: PathRoute = location?.pathRoute ?? {
    path: "/" + pathname.split("/").slice(2).join("/"),
    pathSegments: pathname.split("/").slice(2),
    Page: () => <></>,
    pageState: defaultPageState,
    RootLayouts: [],
    Layouts: [],
  };

  // const { initialize, codepush, statManager } = useCodepush({ serverUrl: process.env.NEXT_PUBLIC_SERVER_URL ?? "" });

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
        location: { href, hash, pathname, params, searchParams, search, pathRoute },
        gestureEnabled,
        setGestureEnabled,
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
  env: BaseClientEnv;
  lang?: string;
  theme?: string;
  prefix?: string;
  gaTrackingId?: string;
}

export const ClientBridge = ({ env, lang, theme, prefix, gaTrackingId }: ClientBridgeProps) => {
  const uiOperation = st.use.uiOperation();
  const pathname = st.use.pathname();
  const params = st.use.params();
  const searchParams = st.use.searchParams();
  const language = (params.lang as string | undefined) ?? lang;
  const path = "/" + pathname.split("/").slice(2).join("/");
  const { setTheme, themes, theme: nextTheme } = useTheme();
  const storeTheme = st.use.theme();
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
    initAuth({ jwt: searchParams.jwt });
    const adminCnst = constantInfo.getDatabase("admin", { allowEmpty: true });
    const userCnst = constantInfo.getDatabase("user", { allowEmpty: true });
    st.set({
      prefix,
      uiOperation: "loading",
    });
    setTimeout(() => {
      st.set({ uiOperation: "idle" });
    }, 2000);
  }, []);

  // useEffect(() => {
  //   if (storeTheme !== nextTheme) setTheme(storeTheme);
  // }, [nextTheme]);

  useEffect(() => {
    //theme가 잇으면 theme부터
    //theme가 있는데 nextTheme가 있으면

    if (nextTheme) setTheme(nextTheme);
    else if (theme) setTheme(theme);
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

export const ClientInner = () => {
  const uiOperation = st.use.uiOperation();
  return (
    <>
      <div id="modal-root" />
      {uiOperation === "idle" ? <Messages /> : null}
    </>
  );
};
Client.Inner = ClientInner;

interface ClientNextBridgeProps {
  lang: string;
  prefix?: string;
}
export const ClientNextBridge = ({ lang, prefix = "" }: ClientNextBridgeProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams() as unknown as Record<string, string>;
  const nextRouter = useRouter();
  useEffect(() => {
    router.init({ type: "next", side: "client", router: nextRouter as unknown as RouterInstance, lang, prefix });
    void device.init({ lang });
  }, []);
  useEffect(() => {
    const { path } = getPathInfo(pathname, lang, prefix);
    st.set({ pathname, path });
  }, [pathname]);
  useEffect(() => {
    st.set({ params });
  }, [params]);
  useEffect(() => {
    st.set({ searchParams: Object.fromEntries(searchParams) });
  }, [searchParams]);
  return null;
};
Client.NextBridge = ClientNextBridge;
