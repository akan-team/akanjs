import { getEnv } from "akanjs/base";
import { clsx, type ReactFont, router, Translator, type WebAppManifest } from "akanjs/client";
import { setRequestTheme } from "akanjs/fetch";
import { Children, Fragment, type ReactNode, Suspense } from "react";
import { FontCss } from "../fontCss";
import { Load } from "../Load";
import { ClientBridge, ClientInner, ClientPathWrapper, ClientSsrBridge, ClientWrapper } from "./Client";
import { ManifestLink, type ProviderProps } from "./Common";

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
  dictionary,
  of,
}: SSRProviderProps) => {
  setRequestTheme(theme);
  if (dictionary && params.lang) Translator.seed(params.lang, dictionary);
  return (
    <Load.Page
      of={of}
      loader={async () => {
        const { lang } = params;
        if (!router.isInitialized) router.init({ type: "ssr", side: "server", lang, prefix });
        return { lang } as const;
      }}
      render={({ lang }) => (
        <SSRWrapper
          className={className}
          appName={appName}
          lang={lang}
          head={head}
          manifest={manifest}
          fonts={fonts}
          prefix={prefix}
          layoutStyle={layoutStyle}
        >
          <ClientWrapper theme={theme} lang={lang} reconnect={reconnect} dictionary={dictionary}>
            <Fragment key="children">{Children.toArray(children)}</Fragment>
            <Suspense key="client-inner" fallback={null}>
              <ClientInner />
            </Suspense>
            <Suspense key="client-bridge" fallback={null}>
              <ClientBridge key="bridge" env={env} theme={theme} prefix={prefix} gaTrackingId={gaTrackingId} />
              <ClientSsrBridge key="ssr-bridge" lang={lang} prefix={prefix} />
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
  head?: ReactNode;
  manifest?: WebAppManifest;
  fonts?: ReactFont[];
  children: ReactNode;
  prefix?: string;
  layoutStyle?: "mobile" | "web";
}

const SSRWrapper = ({
  children,
  head,
  manifest,
  fonts = [],
  className,
  prefix,
  layoutStyle = "web",
}: SSRWrapperProps) => (
  <>
    <ServerFontFace key="fonts" fonts={fonts} />
    <ManifestLink key="manifest" manifest={manifest} />
    {head ? <Fragment key="head">{head}</Fragment> : null}
    <div key="frame-root" id="frameRoot" className={className}>
      <ClientPathWrapper layoutStyle={layoutStyle} prefix={prefix}>
        <div key="top-safe-area" id="topSafeArea" className={clsx("fixed inset-x-0 top-0 bg-base-100")} />
        <div key="page-containers" id="pageContainers" className={clsx("isolate")}>
          <div id="pageContainer">
            <div
              id="pageContent"
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
        >
          <div id="topInsetContent" className={clsx("relative isolate size-full")} />
        </div>
        <div
          key="top-left-action"
          id="topLeftActionContainer"
          className="absolute top-0 left-0 isolate flex aspect-1 items-center justify-center"
        />
        <div
          key="bottom-inset"
          id="bottomInsetContainer"
          className={clsx("fixed inset-x-0 bottom-0 isolate", {
            "left-1/2 w-[600px] -translate-x-1/2": layoutStyle === "mobile",
            "w-full": layoutStyle === "web",
          })}
        >
          <div id="bottomInsetContent" className="isolate size-full" />
        </div>
        <div key="bottom-safe-area" id="bottomSafeArea" className="fixed inset-x-0 bg-base-100" />
      </ClientPathWrapper>
    </div>
  </>
);
SSR.Wrapper = SSRWrapper;

export default SSRProvider;
