"use client";

import { getEnv } from "akanjs/base";
import {
  clsx,
  debugFrame,
  Device,
  getPathInfo,
  type PathRoute,
  type ReactFont,
  type RouteRender,
  router,
  useCsr,
  type WebAppManifest,
} from "akanjs/client";
import { st } from "akanjs/store";
import { animated } from "akanjs/ui";
import { useFetch } from "akanjs/webkit";
import { createElement, memo, type ComponentProps, type ReactNode, type RefObject, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { FontFace } from "../FontFace";
import { Load } from "../Load";
import { Client, ClientPathWrapper } from "./Client";
import { ManifestLink, type ProviderProps } from "./Common";
import { getFrameCssVars } from "./frameCssVars";

export const CSR = ({ children }: { children: ReactNode }) => {
  return <div></div>;
};

export type CSRProviderProps = ProviderProps & {
  fonts: ReactFont[];
};

const CSRProvider = ({
  className,
  appName,
  params,
  head,
  manifest,
  env,
  theme,
  prefix,
  children,
  gaTrackingId,
  fonts,
  layoutStyle = "web",
  reconnect = getEnv().operationMode === "local",
  wsConnect = true,
  of,
}: CSRProviderProps) => {
  return (
    <Load.Page
      of={of}
      loader={async () => {
        const { lang } = params;
        return { lang } as const;
      }}
      render={({ lang }) => (
        <>
          <Client.Wrapper theme={theme} lang={lang} reconnect={reconnect}>
            <CSRWrapper
              className={className}
              appName={appName}
              lang={lang}
              head={head}
              manifest={manifest}
              fonts={fonts}
              prefix={prefix}
              layoutStyle={layoutStyle}
            >
              {children}
            </CSRWrapper>
          </Client.Wrapper>
          <Client.Inner />
          <CSRInner />
          <Client.Bridge
            lang={lang}
            env={env}
            theme={theme}
            prefix={prefix}
            gaTrackingId={gaTrackingId}
            wsConnect={wsConnect}
          />
          <CSRBridge lang={lang} prefix={prefix} />
        </>
      )}
    />
  );
};
CSR.Provider = CSRProvider;

interface CSRWrapperProps {
  className?: string;
  appName: string;
  lang: "en" | "ko" | (string & {});
  head?: ReactNode;
  manifest?: WebAppManifest;
  fonts?: ReactFont[];
  children: ReactNode;
  prefix?: string;
  layoutStyle?: "mobile" | "web";
}
const CSRWrapper = ({
  children,
  lang,
  head,
  manifest,
  fonts = [],
  appName,
  className,
  prefix,
  layoutStyle = "web",
}: CSRWrapperProps) => {
  const {
    frameRootRef,
    topSafeAreaRef,
    bottomSafeAreaRef,
    frameLayout,
    topInset,
    topLeftAction,
    bottomInset,
    topSafeArea,
    bottomSafeArea,
    pathRoutes,
  } = useCsr();
  const csrLoaded = st.use.csrLoaded();
  const { router: reactRouter } = useCsr();
  useEffect(() => {
    debugFrame("csrWrapper.mount", { appName, layoutStyle, pathCount: pathRoutes.length });
    if (layoutStyle === "mobile") {
      document.documentElement.classList.add("akan-mobile-document");
      document.body.classList.add("akan-mobile-document");
    }
    if (!router.isInitialized)
      router.init({
        type: "csr",
        lang,
        prefix,
        router: reactRouter,
        routeManifest: pathRoutes.map((pathRoute) => pathRoute.path),
        indexPath: window.__AKAN_MOBILE_TARGET__?.indexPath,
      });
    st.do.setCsrLoaded(true);
    const onVisibilityChange = () => debugFrame("document.visibility", { visibilityState: document.visibilityState });
    const onPageHide = (event: PageTransitionEvent) => debugFrame("window.pagehide", { persisted: event.persisted });
    const onPageShow = (event: PageTransitionEvent) => debugFrame("window.pageshow", { persisted: event.persisted });
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      debugFrame("csrWrapper.unmount", { appName, layoutStyle });
      if (layoutStyle === "mobile") {
        document.documentElement.classList.remove("akan-mobile-document");
        document.body.classList.remove("akan-mobile-document");
      }
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <>
      {fonts.map((font, idx) => (
        <FontFace key={idx} font={font} />
      ))}
      <ManifestLink manifest={manifest} />
      <CSRFrameRoot
        id="frameRoot"
        className={clsx(className, "h-screen w-full overflow-hidden", {
          "fixed inset-0": layoutStyle === "mobile",
          "akan-mobile-frame": layoutStyle === "mobile",
          "bg-base-200": layoutStyle === "mobile",
        })}
        rootRef={frameRootRef}
      >
        <PageLayerRoot />
        {csrLoaded
          ? pathRoutes.map((pathRoute) => (
              <CSRPageContainer key={pathRoute.path} pathRoute={pathRoute} prefix={prefix} layoutStyle={layoutStyle} />
            ))
          : null}
        <TopChromeLayer
          id="topSafeArea"
          className={clsx("akan-frame-chrome fixed inset-x-0 top-0 max-w-screen bg-base-100", {})}
          layerRef={topSafeAreaRef}
          style={topSafeArea?.containerStyle}
        />
        <TopChromeLayer
          id="topInsetContainer"
          className={clsx("akan-frame-chrome fixed inset-x-0 isolate max-w-screen bg-base-100", {})}
          style={topInset?.containerStyle}
        >
          <CSRFrameSlotTargets slot="topInset" />
        </TopChromeLayer>
        <TopChromeLayer
          id="topLeftActionContainer"
          className={clsx("akan-frame-chrome fixed top-0 isolate flex aspect-1 items-center justify-center", {})}
          style={topLeftAction?.containerStyle}
        >
          <CSRFrameSlotTargets slot="topLeftAction" />
        </TopChromeLayer>
        <BottomChromeLayer
          id="bottomInsetContainer"
          className={clsx("akan-frame-chrome fixed inset-x-0 isolate max-w-screen overflow-hidden", {})}
          style={bottomInset?.containerStyle}
        >
          <CSRFrameSlotTargets slot="bottomInset" />
        </BottomChromeLayer>
        <KeyboardLayer
          id="keyboardInsetContainer"
          className={clsx("akan-frame-chrome fixed inset-x-0 isolate max-w-screen overflow-hidden", {
            hidden: !frameLayout.keyboard.sticky,
          })}
          style={
            frameLayout.keyboard.visible
              ? {
                  top: frameLayout.keyboardAccessory.top,
                  height: frameLayout.keyboardAccessory.height,
                }
              : bottomInset?.containerStyle
          }
          animationDuration={frameLayout.keyboard.animationDuration}
        >
          <CSRFrameSlotTargets slot="keyboardInset" />
        </KeyboardLayer>
        <BottomChromeLayer
          id="bottomSafeArea"
          className="akan-frame-chrome fixed inset-x-0 max-w-screen bg-base-100"
          layerRef={bottomSafeAreaRef}
          style={bottomSafeArea?.containerStyle}
        />
      </CSRFrameRoot>
      <div id="csr-provider-children" className="hidden">
        {children}
      </div>
    </>
  );
};

CSR.Wrapper = CSRWrapper;

interface CSRFrameRootProps {
  id: string;
  className?: string;
  rootRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}
const CSRFrameRoot = ({ id, className, rootRef, children }: CSRFrameRootProps) => (
  <div id={id} className={className} ref={rootRef}>
    {children}
  </div>
);

const PageLayerRoot = () => <div id="pageContainers" className="isolate" />;

interface FrameLayerProps {
  id: string;
  className?: string;
  style?: ComponentProps<typeof animated.div>["style"];
  layerRef?: RefObject<HTMLDivElement | null>;
  children?: ReactNode;
}
const TopChromeLayer = ({ id, className, style, layerRef, children }: FrameLayerProps) => (
  <animated.div id={id} className={className} ref={layerRef} style={style}>
    {children}
  </animated.div>
);
const BottomChromeLayer = ({ id, className, style, layerRef, children }: FrameLayerProps) => (
  <animated.div id={id} className={className} ref={layerRef} style={style}>
    {children}
  </animated.div>
);
const KeyboardLayer = ({
  id,
  className,
  style,
  animationDuration,
  children,
}: FrameLayerProps & { animationDuration?: number }) => (
  <animated.div
    id={id}
    className={className}
    style={{
      ...(style ?? {}),
      transition: `top ${animationDuration ?? 285}ms ease-out, height ${animationDuration ?? 285}ms ease-out`,
      willChange: "top, height",
    }}
  >
    {children}
  </animated.div>
);

type FrameSlotTarget = "topInset" | "topLeftAction" | "bottomInset" | "keyboardInset";

const CSRFrameSlotTargets = ({ slot }: { slot: FrameSlotTarget }) => {
  const {
    history,
    location: currentLocation,
    prevLocation,
    pendingLocation,
    phase,
    pathRoutes,
    topInset,
    topLeftAction,
    bottomInset,
  } = useCsr();
  return (
    <>
      {pathRoutes.map((pathRoute) => {
        const pageType: "current" | "prev" | "cached" | "pending" | null =
          pathRoute === currentLocation.pathRoute
            ? "current"
            : pathRoute === prevLocation?.pathRoute
              ? "prev"
              : pathRoute === pendingLocation?.pathRoute && phase === "preparing"
                ? "pending"
                : pathRoute.pageState.cache && history.current.cachedLocationMap.has(pathRoute.path)
                  ? "cached"
                  : null;
        const zIndex =
          pageType === "current"
            ? history.current.idx
            : pageType === "prev"
              ? (history.current.idxMap.get(prevLocation?.pathname ?? "") ?? 0)
              : pageType === "pending"
                ? history.current.idx + 1
                : 0;
        const style =
          pageType === "current"
            ? slot === "topInset"
              ? topInset?.contentStyle
              : slot === "topLeftAction"
                ? topLeftAction?.contentStyle
                : slot === "bottomInset"
                  ? bottomInset?.contentStyle
                  : bottomInset?.contentStyle
            : pageType === "prev"
              ? slot === "topInset"
                ? topInset?.prevContentStyle
                : slot === "topLeftAction"
                  ? topLeftAction?.prevContentStyle
                  : slot === "bottomInset"
                    ? bottomInset?.prevContentStyle
                    : bottomInset?.prevContentStyle
              : undefined;
        const id =
          slot === "topInset"
            ? `topInsetContent-${pathRoute.path}`
            : slot === "topLeftAction"
              ? `topLeftActionContent-${pathRoute.path}`
              : slot === "bottomInset"
                ? `bottomInsetContent-${pathRoute.path}`
                : `keyboardInsetContent-${pathRoute.path}`;
        return (
          <animated.div
            key={id}
            id={id}
            className={clsx({
              "absolute top-0 left-0 isolate size-full": slot === "topInset",
              "absolute left-0 isolate flex h-full items-center justify-center": slot === "topLeftAction",
              "absolute inset-x-0 bottom-0 isolate h-full": slot === "bottomInset" || slot === "keyboardInset",
              hidden: !pageType || pageType === "cached",
              "pointer-events-none":
                (slot === "topInset" && pageType !== "current") ||
                (slot === "topLeftAction" && pageType !== "current") ||
                (pageType === "prev" && (slot === "bottomInset" || slot === "keyboardInset")),
              "pointer-events-none absolute opacity-0": pageType === "pending",
            })}
            style={{
              ...getFrameCssVars(pathRoute.pageState),
              ...(style ?? {}),
              zIndex: pageType === "pending" ? -1 : zIndex,
              ...(pageType === "pending" ? { opacity: 0 } : {}),
            } as ComponentProps<typeof animated.div>["style"]}
          />
        );
      })}
    </>
  );
};

const CSRInner = () => {
  return <></>;
};
CSR.Inner = CSRInner;

interface CSRBridgeProps {
  lang: string;
  prefix?: string;
}
const CSRBridge = ({ lang, prefix = "" }: CSRBridgeProps) => {
  const { location, pageContentRef } = useCsr();
  useEffect(() => {
    const { path, pathname } = getPathInfo(location.pathname, lang, prefix);
    st.set({
      params: location.params as unknown as { [key: string]: string },
      searchParams: location.searchParams as unknown as { [key: string]: string | string[] },
      pageState: location.pathRoute.pageState,
      pathname,
      path,
    });
  }, [location]);
  useEffect(() => {
    const device = Device.getDevice();
    device.listenKeyboardChanged(st.do.setKeyboardHeight);
    device.setPageContentRef(pageContentRef);
    return () => {
      device.unlistenKeyboardChanged();
    };
  }, []);
  return null;
};
CSR.Bridge = CSRBridge;

interface CSRPageContainerProps {
  pathRoute: PathRoute;
  prefix?: string;
  layoutStyle?: "mobile" | "web";
}
const CSRPageContainer = ({ pathRoute, prefix, layoutStyle }: CSRPageContainerProps) => {
  const {
    history,
    location: currentLocation,
    page: currentPage,
    pageContentRef: currentPageContentRef,
    pageClassName: currentPageClassName,
    pageBind: currentPageBind,
    prevLocation,
    pendingLocation,
    phase,
    prevPage,
    prevPageContentRef,
  } = useCsr();
  const pageType: "current" | "prev" | "cached" | "pending" | null =
    pathRoute === currentLocation.pathRoute
      ? "current"
      : pathRoute === prevLocation?.pathRoute
        ? "prev"
        : pathRoute === pendingLocation?.pathRoute && phase === "preparing"
          ? "pending"
          : pathRoute.pageState.cache && history.current.cachedLocationMap.has(pathRoute.path)
            ? "cached"
            : null;
  if (!pageType) return null;
  const pageContainers = document.getElementById("pageContainers");
  if (!pageContainers) return null;
  const {
    location,
    page,
    pageContentRef,
    pageClassName,
    pageBind,
    zIndex,
  } =
    pageType === "current"
      ? {
          location: currentLocation,
          page: currentPage,
          pageContentRef: currentPageContentRef,
          pageClassName: currentPageClassName,
          pageBind: currentPageBind,
          zIndex: history.current.idx,
        }
      : pageType === "prev"
        ? {
            location: prevLocation,
            page: prevPage,
            pageContentRef: prevPageContentRef,
            pageClassName: "",
            pageBind: () => ({}),
            zIndex: history.current.idxMap.get(prevLocation?.pathname ?? "") ?? 0,
          }
          : pageType === "pending"
            ? {
                location: pendingLocation,
                page: null,
                pageContentRef: null,
                pageClassName: "",
                pageBind: () => ({}),
                zIndex: history.current.idx + 1,
              }
        : {
            location: history.current.cachedLocationMap.get(pathRoute.path),
            page: null,
            pageContentRef: null,
            pageClassName: "",
            pageBind: () => ({}),
            zIndex: 0,
          };
  if (!location) return null;
  return (
    <>
      {createPortal(
        <animated.div
          id={`pageContainer-${pathRoute.path}`}
          style={{
            ...(page?.containerStyle ?? {}),
            ...(pageType === "pending"
              ? { opacity: 0, pointerEvents: "none", transform: "translate3d(100vw, 0, 0)", zIndex: -1 }
              : { zIndex }),
          }}
          className={clsx("absolute top-0 left-0 isolate w-screen", {
            absolute: pageType !== "current",
            hidden: pageType === "cached",
            "pointer-events-none": pageType === "prev" || pageType === "pending",
          })}
        >
          <ClientPathWrapper
            id="pageContent"
            wrapperRef={pageContentRef}
            bind={pageBind}
            className={clsx("akan-page-content relative isolate w-full overflow-x-hidden bg-base-100 shadow-inner", {
              "relative isolate overflow-x-hidden bg-base-100 shadow-inner": pageType === "current",
              "pointer-events-none isolate h-screen w-screen overflow-hidden": pageType === "prev" || pageType === "pending",
              [pageClassName]: pathRoute.pageState.gesture,
            })}
            style={page?.contentStyle}
            pageType={pageType}
            location={location}
            prefix={prefix}
          >
            <RenderLayer
              renders={[...pathRoute.renderLayouts, pathRoute.renderPage]}
              index={0}
              params={location.params}
              searchParams={location.searchParams}
            />
          </ClientPathWrapper>
        </animated.div>,
        pageContainers,
      )}
    </>
  );
};

interface RenderLayerProps {
  renders: RouteRender[];
  index: number;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
}
const RenderLayer = memo(({ renders, index, params, searchParams }: RenderLayerProps) => {
  const isLast = index >= renders.length - 1;
  const children = isLast ? (
    <></>
  ) : (
    <RenderLayer renders={renders} index={index + 1} params={params} searchParams={searchParams} />
  );
  const routeRender = renders[index];
  const isAsyncRender = isAsyncRouteRender(routeRender);
  const resultRef = useRef<ReactNode | Promise<ReactNode> | null>(null);
  if (isAsyncRender && resultRef.current === null) {
    resultRef.current = routeRender?.render({ children, params, searchParams } as never) ?? null;
  }
  const { fulfilled, value: Component } = useFetch(resultRef.current);
  if (!routeRender) return null;
  if (!isAsyncRender) return createElement(routeRender.render as never, { children, params, searchParams } as never);
  if (!fulfilled || !Component) return <>{composeLoadingFallback(renders.slice(index), params)}</>;
  return <>{Component}</>;
});

function isAsyncRouteRender(routeRender?: RouteRender): boolean {
  return Boolean(routeRender?.isAsync || routeRender?.render.constructor.name === "AsyncFunction");
}

function composeLoadingFallback(renders: RouteRender[], params: Record<string, string>): ReactNode {
  let element: ReactNode = null;
  for (let i = renders.length - 1; i >= 0; i--) {
    const Loading = renders[i]?.Loading;
    if (!Loading) continue;
    element = Loading({ params, children: element } as never) as ReactNode;
  }
  return element;
}

export default CSRProvider;
