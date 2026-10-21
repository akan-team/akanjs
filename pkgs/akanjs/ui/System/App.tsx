"use client";
import { cn, type ReactFont, type RouteViewport } from "akanjs/client";
import type { AkanTheme } from "akanjs/fetch";
import type { ReactNode } from "react";
import { EmbedApproval } from "../Agent/EmbedApproval";
import { FontFace } from "../FontFace";
import { Client } from "./Client";

export interface AppProviderProps {
  className?: string;
  params: { lang: string };
  /** The app's page path without its locale, as `usePage()` reads it. */
  path?: string;
  env?: object;
  theme?: AkanTheme;
  viewport?: RouteViewport;
  fonts?: ReactFont[];
  children: ReactNode;
}
export const AppProvider = ({
  className,
  params,
  path,
  env,
  theme,
  viewport,
  fonts = [],
  children,
}: AppProviderProps) => {
  return (
    <>
      <Client.Wrapper theme={theme} lang={params.lang} path={path} reconnect={false}>
        {fonts.map((font, idx) => (
          <FontFace key={idx} font={font} />
        ))}
        <div className={cn("w-full", className)}>{children}</div>
      </Client.Wrapper>
      <Client.Inner />
      <Client.Bridge lang={params.lang} env={env} theme={theme} viewport={viewport} wsConnect={false} />
      <EmbedApproval />
    </>
  );
};
