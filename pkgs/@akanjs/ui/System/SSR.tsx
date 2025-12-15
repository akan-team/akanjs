/* eslint-disable @next/next/no-head-element */

import { baseEnv } from "@akanjs/base";
import { clsx, router } from "@akanjs/client";
import type { AllDictionary } from "@akanjs/dictionary";
import { SerializedSignal } from "@akanjs/signal";
import { ReactNode, Suspense } from "react";

import { Load } from "../Load";
import { ClientBridge, ClientInner, ClientNextBridge, ClientPathWrapper, ClientWrapper } from "./Client";
import { type ProviderProps } from "./Common";

export const SSR = () => {
  return <></>;
};

export type SSRProviderProps = ProviderProps & {
  fonts?: NextFont[];
};

const SSRProvider = ({
  className,
  appName,
  params,
  head,
  env,
  gaTrackingId,
  children,
  theme,
  prefix,
  fonts,
  layoutStyle = "web",
  reconnect = baseEnv.operationMode === "local",
  of,
}: SSRProviderProps) => {
  return (
    <Load.Page
      of={of}
      loader={async () => {
        const { lang } = await params;
        if (!router.isInitialized) router.init({ type: "next", side: "server", lang, prefix });
        return { lang } as const;
      }}
      render={({ lang }) => (
        <SSRWrapper
          className={className}
          appName={appName}
          lang={lang}
          head={head}
          fonts={fonts}
          prefix={prefix}
          layoutStyle={layoutStyle}
        >
          <ClientWrapper
            theme={theme}
            lang={lang}
            dictionary={(global.dictionary as AllDictionary)[lang]}
            signals={global.signals as SerializedSignal[]}
            reconnect={reconnect}
          >
            {children}
            <Suspense fallback={null}>
              <ClientInner />
            </Suspense>
            <Suspense fallback={null}>
              <ClientBridge env={env} theme={theme} prefix={prefix} gaTrackingId={gaTrackingId} />
              <ClientNextBridge lang={lang} prefix={prefix} />
            </Suspense>
          </ClientWrapper>
        </SSRWrapper>
      )}
    />
  );
};

SSR.Provider = SSRProvider;

export interface NextFont {
  className: string;
  variable: string;
}

interface SSRWrapperProps {
  className?: string;
  appName: string;
  lang: "en" | "ko" | (string & {});
  head?: ReactNode;
  fonts?: NextFont[];
  children: any;
  prefix?: string;
  layoutStyle?: "mobile" | "web";
}

const SSRWrapper = ({
  children,
  lang,
  head,
  fonts = [],
  appName,
  className,
  prefix,
  layoutStyle = "web",
}: SSRWrapperProps) => (
  <html lang={lang} className={`${fonts.map((font) => font.variable).join(" ")} ${className}`} suppressHydrationWarning>
    <head>{head}</head>
    <body className="app">
      <div id="frameRoot" className={className}>
        <ClientPathWrapper layoutStyle={layoutStyle} prefix={prefix}>
          <div id="topSafeArea" className={clsx("bg-base-100 fixed inset-x-0 top-0")} />
          <div id="pageContainers" className={clsx("isolate")}>
            <div id="pageContainer">
              <div
                id="pageContent"
                className={clsx("bg-base-100 relative isolate", {
                  "w-screen": layoutStyle === "web",
                  "left-1/2 h-screen w-[600px] -translate-x-1/2": layoutStyle === "mobile",
                })}
              >
                {children}
              </div>
            </div>
          </div>
          <div
            id="topInsetContainer"
            className={clsx("bg-base-100 fixed inset-x-0 top-0 isolate", {
              "left-1/2 w-[600px] -translate-x-1/2": layoutStyle === "mobile",
              "w-screen": layoutStyle === "web",
            })}
          >
            <div id="topInsetContent" className={clsx("relative isolate size-full")} />
          </div>
          <div
            id="topLeftActionContainer"
            className="aspect-1 absolute top-0 left-0 isolate flex items-center justify-center"
          />
          <div
            id="bottomInsetContainer"
            className={clsx("fixed inset-x-0 bottom-0 isolate", {
              "left-1/2 w-[600px] -translate-x-1/2": layoutStyle === "mobile",
              "w-screen": layoutStyle === "web",
            })}
          >
            <div id="bottomInsetContent" className="isolate size-full" />
          </div>
          <div id="bottomSafeArea" className="bg-base-100 fixed inset-x-0" />
        </ClientPathWrapper>
      </div>
    </body>
  </html>
);
SSR.Wrapper = SSRWrapper;

export default SSRProvider;
