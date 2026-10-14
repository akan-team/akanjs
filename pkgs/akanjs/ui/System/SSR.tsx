import { getEnv } from "akanjs/base";
import {
  cn,
  defaultPageState,
  getPathInfo,
  type PageState,
  type ReactFont,
  router,
  Translator,
  transitionTypes,
  usePage,
  viewTransitionClassOf,
} from "akanjs/client";
import { getRequestFrameState, setRequestTheme } from "akanjs/fetch";
import {
  Children,
  type CSSProperties,
  Fragment,
  type ReactNode,
  Suspense,
  type ViewTransitionClassPerType,
} from "react";
import { ViewTransition } from "../../client/viewTransition";
import { FontCss } from "../fontCss";
import { frameSlotContainerClassNames, frameSlotContentClassNames, frameSlotStyles } from "../Layout/frameSlot";
import { Load } from "../Load";
import { ClientBridge, ClientInner, ClientPathWrapper, ClientSsrBridge, ClientWrapper } from "./Client";
import { getFrameCssVars, isResponsiveFrame, type ProviderProps } from "./Common";

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
  env,
  children,
  theme = "css",
  viewport,
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

  // Resolved like `l()` does, not via `params.lang`, which is set only when the matched pattern has `:lang`.
  const { lang: activeLocale, path: activePath } = usePage();

  // Every locale, fresh, on the server (never shipped): no stale keys after a dictionary edit.
  if (allDictionary) for (const [lng, dict] of Object.entries(allDictionary)) Translator.replace(lng, dict);

  // Only the active locale is serialized to the client, with the default locale's text filled into its gaps.
  const activeDictionary = (allDictionary && Translator.withDefaultLocale(allDictionary, activeLocale)) ?? dictionary;
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
                viewport={viewport}
                prefix={prefix}
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

// An RSC navigation names its type after the route's `.config({ transition })`, and the page takes the class of the
// same name; a navigation that names none leaves the page to swap in place.
const pageViewTransition: ViewTransitionClassPerType = Object.fromEntries([
  ["default", "none"],
  ...transitionTypes.flatMap((transition) =>
    transition === "none"
      ? []
      : (["push", "pop"] as const).map((direction) => {
          const type = viewTransitionClassOf(transition, direction);
          return [type, type];
        }),
  ),
]);

interface SSRWrapperProps {
  className?: string;
  appName: string;
  lang: "en" | "ko" | (string & {});
  path: string;
  head?: ReactNode;
  fonts?: ReactFont[];
  children: ReactNode;
  prefix?: string;
  layoutStyle?: "mobile" | "web";
  pageState?: PageState;
}

const SSRWrapper = ({
  children,
  head,
  fonts = [],
  className,
  lang,
  path,
  prefix,
  layoutStyle = "web",
  pageState = defaultPageState,
}: SSRWrapperProps) => {
  const { href, pathname, search, hash } = getPathInfo(path, lang, prefix ?? "");
  const frameCssVars = getFrameCssVars(pageState, { cssResolved: true });
  const pageContentStyle: CSSProperties = {
    paddingTop: "var(--akan-page-padding-top)",
    paddingBottom: "var(--akan-page-padding-bottom)",
  };
  const topSafeAreaStyle: CSSProperties = {
    top: "var(--akan-viewport-offset-top, 0px)",
    height: "var(--akan-top-safe-area)",
    backgroundColor: pageState.topSafeAreaColor,
  };
  const bottomSafeAreaStyle: CSSProperties = {
    bottom: 0,
    height: "var(--akan-bottom-safe-area)",
    backgroundColor: pageState.bottomSafeAreaColor,
    //? It extends the bottom chrome's colour to the screen's edge; with none, a page's own bottom bar paints that strip.
    ...(pageState.bottomSafeAreaColor === defaultPageState.bottomSafeAreaColor
      ? { visibility: "var(--akan-bottom-inset-visibility, visible)" as CSSProperties["visibility"] }
      : {}),
  };

  return (
    <>
      <ServerFontFace key="fonts" fonts={fonts} />
      {head ? <Fragment key="head">{head}</Fragment> : null}
      <div
        key="frame-root"
        id="frameRoot"
        className={className}
        style={frameCssVars}
        data-akan-frame-responsive={isResponsiveFrame(pageState, { cssResolved: true }) ? "" : undefined}
      >
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
            className={cn("fixed inset-x-0 top-0 bg-background")}
            style={topSafeAreaStyle}
          />
          <div key="page-containers" id="pageContainers" className={cn("isolate")}>
            <div id="pageContainer">
              <div
                id="pageContent"
                style={pageContentStyle}
                className={cn(
                  "relative isolate",
                  layoutStyle === "web" && "w-full",
                  layoutStyle === "mobile" && "left-1/2 h-screen w-full max-w-[600px] -translate-x-1/2",
                )}
              >
                {ViewTransition ? (
                  <ViewTransition
                    default="none"
                    enter={pageViewTransition}
                    exit={pageViewTransition}
                    update={pageViewTransition}
                  >
                    {Children.toArray(children)}
                  </ViewTransition>
                ) : (
                  Children.toArray(children)
                )}
              </div>
            </div>
          </div>
          <div
            key="top-inset"
            id="topInsetContainer"
            className={cn(
              frameSlotContainerClassNames.topInset,
              layoutStyle === "mobile" && "left-1/2 w-full max-w-[600px] -translate-x-1/2",
              layoutStyle === "web" && "w-full",
            )}
            style={frameSlotStyles.topInset}
          >
            <div id="topInsetContent" className={frameSlotContentClassNames.topInset} />
          </div>
          <div
            key="top-left-action"
            id="topLeftActionContainer"
            className={cn(
              frameSlotContainerClassNames.topLeftAction,
              layoutStyle === "mobile" && "left-[max(0px,calc(50%_-_300px))]",
            )}
            style={frameSlotStyles.topLeftAction}
          >
            <div id="topLeftActionContent" className={frameSlotContentClassNames.topLeftAction} />
          </div>
          <div
            key="bottom-inset"
            id="bottomInsetContainer"
            className={cn(
              frameSlotContainerClassNames.bottomInset,
              layoutStyle === "mobile" && "left-1/2 w-full max-w-[600px] -translate-x-1/2",
              layoutStyle === "web" && "w-full",
            )}
            style={frameSlotStyles.bottomInset}
          >
            <div id="bottomInsetContent" className={frameSlotContentClassNames.bottomInset} />
          </div>
          <div
            key="keyboard-inset"
            id="keyboardInsetContainer"
            className={cn(
              frameSlotContainerClassNames.keyboardInset,
              layoutStyle === "mobile" && "left-1/2 w-full max-w-[600px] -translate-x-1/2",
              layoutStyle === "web" && "w-full",
            )}
            style={frameSlotStyles.keyboardInset}
          >
            <div id="keyboardInsetContent" className={frameSlotContentClassNames.keyboardInset} />
          </div>
          <div
            key="bottom-safe-area"
            id="bottomSafeArea"
            className="fixed inset-x-0 bg-background"
            style={bottomSafeAreaStyle}
          />
        </ClientPathWrapper>
      </div>
    </>
  );
};
SSR.Wrapper = SSRWrapper;

export default SSRProvider;
