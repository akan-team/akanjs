"use client";

import { baseEnv } from "@akanjs/base";
import { clsx, device, getPathInfo, PathRoute, type ReactFont, router, useCsr } from "@akanjs/client";
import { usePushNoti } from "@akanjs/next";
import { st } from "@akanjs/store";
import { animated } from "@akanjs/ui";
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

import { FontFace } from "../FontFace";
import { Load } from "../Load";
import { Client, ClientPathWrapper } from "./Client";
import { type ProviderProps } from "./Common";

export const CSR = ({ children }) => {
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
  env,
  theme,
  prefix,
  children,
  gaTrackingId,
  fonts,
  layoutStyle = "web",
  reconnect = baseEnv.operationMode === "local",
  of,
}: CSRProviderProps) => {
  return (
    <Load.Page
      of={of}
      loader={async () => {
        const { lang } = await params;
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
              fonts={fonts}
              prefix={prefix}
              layoutStyle={layoutStyle}
            >
              {children}
            </CSRWrapper>
          </Client.Wrapper>
          <Client.Inner />
          <CSRInner />
          <Client.Bridge lang={lang} env={env} theme={theme} prefix={prefix} gaTrackingId={gaTrackingId} />
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
  fonts?: ReactFont[];
  children: any;
  prefix?: string;
  layoutStyle?: "mobile" | "web";
}
const CSRWrapper = ({
  children,
  lang,
  head,
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
    if (!router.isInitialized) router.init({ type: "csr", lang, prefix, router: reactRouter });
    st.do.setCsrLoaded(true);
  }, []);

  return (
    <>
      {fonts.map((font, idx) => (
        <FontFace key={idx} font={font} />
      ))}
      <div
        id="frameRoot"
        className={clsx(className, "h-screen w-full overflow-hidden", {
          "bg-base-200": layoutStyle === "mobile",
        })}
        ref={frameRootRef}
      >
        <div id="pageContainers" className="isolate"></div>
        {csrLoaded
          ? pathRoutes.map((pathRoute) => (
              <CSRPageContainer key={pathRoute.path} pathRoute={pathRoute} prefix={prefix} layoutStyle={layoutStyle} />
            ))
          : null}
        <animated.div
          id="topSafeArea"
          className={clsx("bg-base-100 fixed inset-x-0 top-0 max-w-screen", {})}
          ref={topSafeAreaRef}
          style={topSafeArea?.containerStyle}
        />
        <animated.div
          id="topInsetContainer"
          className={clsx("bg-base-100 fixed inset-x-0 isolate max-w-screen", {})}
          style={topInset?.containerStyle}
        />
        <animated.div
          id="topLeftActionContainer"
          className={clsx("aspect-1 absolute top-0 isolate flex items-center justify-center", {})}
          style={topLeftAction?.containerStyle}
        />
        <animated.div
          id="bottomInsetContainer"
          className={clsx("fixed inset-x-0 isolate max-w-screen", {})}
          style={bottomInset?.containerStyle}
        />
        <animated.div
          id="bottomSafeArea"
          className="bg-base-100 fixed inset-x-0 max-w-screen"
          ref={bottomSafeAreaRef}
          style={bottomSafeArea?.containerStyle}
        />
      </div>
      <div id="csr-provider-children" className="hidden">
        {children}
      </div>
    </>
  );
};

CSR.Wrapper = CSRWrapper;

const CSRInner = () => {
  return <></>;
};
CSR.Inner = CSRInner;

interface CSRBridgeProps {
  lang: string;
  prefix?: string;
}
const CSRBridge = ({ lang, prefix = "" }: CSRBridgeProps) => {
  const pushNoti = usePushNoti();
  const { location, pageContentRef } = useCsr();
  useEffect(() => {
    const { path, pathname } = getPathInfo(location.pathname, lang, prefix);
    st.do.set({
      params: location.params as unknown as { [key: string]: string },
      searchParams: location.searchParams as unknown as { [key: string]: string },
      pageState: location.pathRoute.pageState,
      pathname,
      path,
    });
  }, [location]);
  useEffect(() => {
    device.listenKeyboardChanged(st.do.setKeyboardHeight);
    device.setPageContentRef(pageContentRef);
    if (device.info.platform === "web") return;
    void (async () => {
      await pushNoti.init();
      const token = await pushNoti.getToken();
      if (!token) return;
      st.do.setDeviceToken(token);
    })();
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
    prevPage,
    prevPageContentRef,
    topInset,
    bottomInset,
    topLeftAction,
  } = useCsr();
  const pageType: "current" | "prev" | "cached" | null =
    pathRoute === currentLocation.pathRoute
      ? "current"
      : pathRoute === prevLocation?.pathRoute
        ? "prev"
        : pathRoute.pageState.cache && history.current.cachedLocationMap.has(pathRoute.path)
          ? "cached"
          : null;
  if (!pageType) return null;
  const pageContainers = document.getElementById("pageContainers");
  const topInsetContainer = document.getElementById("topInsetContainer");
  const bottomInsetContainer = document.getElementById("bottomInsetContainer");
  const topLeftActionContainer = document.getElementById("topLeftActionContainer");
  if (!pageContainers || !topInsetContainer || !bottomInsetContainer || !topLeftActionContainer) return null;
  const {
    location,
    page,
    pageContentRef,
    pageClassName,
    pageBind,
    topInsetContentStyle,
    topLeftActionContentStyle,
    bottomInsetContentStyle,
    zIndex,
  } =
    pageType === "current"
      ? {
          location: currentLocation,
          page: currentPage,
          pageContentRef: currentPageContentRef,
          pageClassName: currentPageClassName,
          pageBind: currentPageBind,
          topInsetContentStyle: topInset?.contentStyle,
          topLeftActionContentStyle: topLeftAction?.contentStyle,
          bottomInsetContentStyle: bottomInset?.contentStyle,
          zIndex: history.current.idx,
        }
      : pageType === "prev"
        ? {
            location: prevLocation,
            page: prevPage,
            pageContentRef: prevPageContentRef,
            pageClassName: "",
            pageBind: () => ({}),
            topInsetContentStyle: topInset?.prevContentStyle,
            topLeftActionContentStyle: topLeftAction?.prevContentStyle,
            bottomInsetContentStyle: bottomInset?.prevContentStyle,
            zIndex: history.current.idxMap.get(prevLocation?.pathname ?? "") ?? 0,
          }
        : {
            location: history.current.cachedLocationMap.get(pathRoute.path),
            page: null,
            pageContentRef: null,
            pageClassName: "",
            pageBind: () => ({}),
            topInsetContentStyle: undefined,
            topLeftActionContentStyle: undefined,
            bottomInsetContentStyle: undefined,
            zIndex: 0,
          };
  if (!location) return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const Page = pathRoute.Page as any;
  return (
    <>
      {createPortal(
        <animated.div
          id={`pageContainer-${pathRoute.path}`}
          style={{ ...(page?.containerStyle ?? {}), zIndex }}
          className={clsx("absolute top-0 left-0 isolate w-screen", {
            absolute: pageType !== "current",
            hidden: pageType === "cached",
            "pointer-events-none": pageType === "prev",
          })}
        >
          <ClientPathWrapper
            id="pageContent"
            wrapperRef={pageContentRef}
            bind={pageBind}
            className={clsx("bg-base-100 relative isolate w-full overflow-x-hidden shadow-inner", {
              "bg-base-100 relative isolate overflow-x-hidden shadow-inner": pageType === "current",
              "pointer-events-none isolate h-screen w-screen overflow-hidden": pageType === "prev",
              [pageClassName]: pathRoute.pageState.gesture,
            })}
            style={page?.contentStyle}
            pageType={pageType}
            location={location}
            prefix={prefix}
          >
            {pathRoute.Layouts.reduceRight(
              (children, Layout: any) => {
                return (
                  <Layout params={location.params} searchParams={location.searchParams}>
                    {children}
                  </Layout>
                );
              },
              <Page params={location.params} searchParams={location.searchParams} />
            )}
          </ClientPathWrapper>
        </animated.div>,
        pageContainers
      )}
      {createPortal(
        <ClientPathWrapper
          id={`topInsetContent-${pathRoute.path}`}
          className={clsx("absolute top-0 left-0 isolate size-full", {
            hidden: pageType === "cached",
            "pointer-events-none": pageType === "prev",
          })}
          style={{ ...topInsetContentStyle, zIndex }}
          pageType={pageType}
          location={location}
          prefix={prefix}
        />,
        topInsetContainer
      )}
      {createPortal(
        <ClientPathWrapper
          id={`topLeftActionContent-${pathRoute.path}`}
          className={clsx("absolute left-0 isolate flex h-full items-center justify-center", {
            hidden: pageType === "cached",
            "pointer-events-none": pageType === "prev",
          })}
          style={{ ...topLeftActionContentStyle, zIndex }}
          pageType={pageType}
          location={location}
          prefix={prefix}
        />,
        topLeftActionContainer
      )}
      {createPortal(
        <ClientPathWrapper
          id={`bottomInsetContent-${pathRoute.path}`}
          className={clsx("bottom-0 isolate size-full", {
            hidden: pageType === "cached",
            "pointer-events-none absolute": pageType === "prev",
            relative: pageType === "current",
          })}
          style={{ ...bottomInsetContentStyle, zIndex }}
          pageType={pageType}
          location={location}
          prefix={prefix}
        />,
        bottomInsetContainer
      )}
    </>
  );
};

export default CSRProvider;
