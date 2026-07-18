import { getEnv } from "akanjs/base";
import {
  clsx,
  defaultPageState,
  getPathInfo,
  type PageState,
  type ReactFont,
  router,
  Translator,
  usePage,
  type WebAppManifest,
} from "akanjs/client";
import { getRequestFrameState, setRequestTheme } from "akanjs/fetch";
import { Children, Fragment, type CSSProperties, type ReactNode, Suspense } from "react";
import { FontCss } from "../fontCss";
import { Load } from "../Load";
import { createServerPortalStore, ServerPortalOutlet, setActiveServerPortalStore } from "../ServerPortal";
import { ClientBridge, ClientInner, ClientPathWrapper, ClientSsrBridge, ClientWrapper } from "./Client";
import { ManifestLink, type ProviderProps } from "./Common";
import { getFrameCssVars } from "./frameCssVars";

export const SSR = () => {
  return <></>;
};

export type SSRProviderProps = ProviderProps & {
  fonts?: ReactFont[];
};

const SSRProvider = ({
  className,
  appName,
  params,
  head,
  manifest,
  env,
  gaTrackingId,
  children,
  theme = "css",
  prefix,
  fonts,
  layoutStyle = "web",
  reconnect = getEnv().operationMode === "local",
  wsConnect = true,
  dictionary,
  allDictionary,
  of,
}: SSRProviderProps) => {
  setRequestTheme(theme);
  Translator.markHydrated();

  // Resolve the active locale exactly like `l()` does (getPageInfo / request), not via `params.lang`,
  // which is only populated when the matched route pattern contains `:lang` and can otherwise diverge.
  const { lang: activeLocale, path: activePath } = usePage();

  // Server (RSC worker) renders server components: replace every locale with the latest snapshot. This is
  // free on the server (it never reaches the browser bundle) and avoids stale keys after dictionary edits.
  if (allDictionary) for (const [lng, dict] of Object.entries(allDictionary)) Translator.replace(lng, dict);

  // Only the active locale is serialized to the client (Flight payload) to keep the browser bundle lean.
  const activeDictionary = allDictionary?.[activeLocale] ?? dictionary;
  const pageState = getRequestFrameState<PageState>() ?? defaultPageState;

  return (
    <Load.Page
      of={of}
      loader={async () => {
        if (!router.isInitialized) router.init({ type: "ssr", side: "server", lang: activeLocale, prefix });
        return { lang: activeLocale, path: activePath } as const;
      }}
      render={({ lang, path }) => (
        <SSRWrapper
          className={className}
          appName={appName}
          lang={lang}
          path={path}
          head={head}
          manifest={manifest}
          fonts={fonts}
          prefix={prefix}
          layoutStyle={layoutStyle}
          pageState={pageState}
        >
          <ClientWrapper theme={theme} lang={lang} path={path} reconnect={reconnect} dictionary={activeDictionary}>
            <Fragment key="children">{Children.toArray(children)}</Fragment>
            <Suspense key="client-inner" fallback={null}>
              <ClientInner />
            </Suspense>
            <Suspense key="client-bridge" fallback={null}>
              <ClientBridge
                key="bridge"
                env={env}
                theme={theme}
                prefix={prefix}
                gaTrackingId={gaTrackingId}
                wsConnect={wsConnect}
              />
              <ClientSsrBridge key="ssr-bridge" lang={lang} prefix={prefix} initialPageState={pageState} />
            </Suspense>
          </ClientWrapper>
        </SSRWrapper>
      )}
    />
  );
};

SSR.Provider = SSRProvider;

const ServerFontFace = ({ fonts }: { fonts: ReactFont[] }) => {
  const css = FontCss.getRuntimeCss(fonts);
  const preloads = FontCss.getPreloads(fonts);
  if (!css && preloads.length === 0) return null;
  return (
    <>
      {preloads.map((preload) => (
        <link key={preload.href} rel="preload" href={preload.href} as="font" type={preload.type} crossOrigin="" />
      ))}
      {css ? (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: injecting @font-face CSS
        <style data-akan-fonts dangerouslySetInnerHTML={{ __html: css }} />
      ) : null}
    </>
  );
};

interface SSRWrapperProps {
  className?: string;
  appName: string;
  lang: "en" | "ko" | (string & {});
  path: string;
  head?: ReactNode;
  manifest?: WebAppManifest;
  fonts?: ReactFont[];
  children: ReactNode;
  prefix?: string;
  layoutStyle?: "mobile" | "web";
  pageState?: PageState;
}

const SSRWrapper = ({
  children,
  head,
  manifest,
  fonts = [],
  className,
  lang,
  path,
  prefix,
  layoutStyle = "web",
  pageState = defaultPageState,
}: SSRWrapperProps) => {
  const { href, pathname, search, hash } = getPathInfo(path, lang, prefix ?? "");
  const serverPortalStore = createServerPortalStore();
  setActiveServerPortalStore(serverPortalStore);
  const frameCssVars = getFrameCssVars(pageState);
  const pageContentStyle: CSSProperties = {
    paddingTop: "var(--akan-page-padding-top)",
    paddingBottom: "var(--akan-page-padding-bottom)",
  };
  const topSafeAreaStyle: CSSProperties = {
    height: "var(--akan-top-safe-area)",
    backgroundColor: pageState.topSafeAreaColor,
  };
  const topInsetStyle: CSSProperties = {
    top: "var(--akan-top-safe-area)",
    height: "var(--akan-top-inset)",
  };
  const bottomSafeAreaStyle: CSSProperties = {
    bottom: 0,
    height: "var(--akan-bottom-safe-area)",
    backgroundColor: pageState.bottomSafeAreaColor,
  };
  const bottomInsetStyle: CSSProperties = {
    bottom: "var(--akan-bottom-safe-area)",
    height: "var(--akan-bottom-inset)",
  };

  return (
    <>
      <ServerFontFace key="fonts" fonts={fonts} />
      <ManifestLink key="manifest" manifest={manifest} />
      {head ? <Fragment key="head">{head}</Fragment> : null}
      <div key="frame-root" id="frameRoot" className={className} style={frameCssVars}>
        <ClientPathWrapper
          layoutStyle={layoutStyle}
          prefix={prefix}
          initialHref={href}
          initialPath={path}
          initialPathname={pathname}
          initialParams={{ lang }}
          initialSearch={search}
          initialHash={hash}
          initialPageState={pageState}
        >
            <div
              key="top-safe-area"
              id="topSafeArea"
              className={clsx("fixed inset-x-0 top-0 bg-base-100")}
              style={topSafeAreaStyle}
            />
            <div key="page-containers" id="pageContainers" className={clsx("isolate")}>
              <div id="pageContainer">
                <div
                  id="pageContent"
                  style={pageContentStyle}
                  className={clsx("relative isolate", {
                    "w-full": layoutStyle === "web",
                    "left-1/2 h-screen w-[600px] -translate-x-1/2": layoutStyle === "mobile",
                  })}
                >
                  {Children.toArray(children)}
                </div>
              </div>
            </div>
            <div
              key="top-inset"
              id="topInsetContainer"
              className={clsx("fixed inset-x-0 top-0 isolate bg-base-100", {
                "left-1/2 w-[600px] -translate-x-1/2": layoutStyle === "mobile",
                "w-full": layoutStyle === "web",
              })}
              style={topInsetStyle}
            >
              <div id="topInsetContent" className={clsx("relative isolate size-full")}>
                <ServerPortalOutlet id="topInsetContent" />
              </div>
            </div>
            <div
              key="top-left-action"
              id="topLeftActionContainer"
              className="absolute top-0 left-0 isolate flex aspect-1 items-center justify-center"
              style={topInsetStyle}
            >
              <div id="topLeftActionContent" className="isolate flex size-full items-center justify-center">
                <ServerPortalOutlet id="topLeftActionContent" />
              </div>
            </div>
            <div
              key="bottom-inset"
              id="bottomInsetContainer"
              className={clsx("pointer-events-none fixed inset-x-0 bottom-0 isolate overflow-hidden", {
                "left-1/2 w-[600px] -translate-x-1/2": layoutStyle === "mobile",
                "w-full": layoutStyle === "web",
              })}
              style={bottomInsetStyle}
            >
              <div id="bottomInsetContent" className="pointer-events-none isolate size-full">
                <ServerPortalOutlet id="bottomInsetContent" />
              </div>
            </div>
            <div
              key="keyboard-inset"
              id="keyboardInsetContainer"
              className={clsx("pointer-events-none fixed inset-x-0 bottom-0 isolate overflow-hidden", {
                "left-1/2 w-[600px] -translate-x-1/2": layoutStyle === "mobile",
                "w-full": layoutStyle === "web",
              })}
              style={bottomInsetStyle}
            >
              <div id="keyboardInsetContent" className="pointer-events-none isolate size-full">
                <ServerPortalOutlet id="keyboardInsetContent" />
              </div>
            </div>
            <div
              key="bottom-safe-area"
              id="bottomSafeArea"
              className="fixed inset-x-0 bg-base-100"
              style={bottomSafeAreaStyle}
            />
        </ClientPathWrapper>
      </div>
    </>
  );
};
SSR.Wrapper = SSRWrapper;

export default SSRProvider;
