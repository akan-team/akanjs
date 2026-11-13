"use client";
import { fetch, st, usePage } from "@libs/shared/client";
import { cn } from "akanjs/client";
import { useEffect, useRef, useState } from "react";

interface CallbackProps {
  className?: string;
  state: string;
  code: string;
  iss: string | null;
  error: string | null;
}
export const Callback = ({ className, state, code, iss, error }: CallbackProps) => {
  const { l } = usePage();
  const callback = st.use.remoteCallback();
  useEffect(() => {
    if (!error && state && code) void st.do.completeRemoteConnection(state, code, iss).catch(() => null);
  }, [state, code]);
  const status = error || !state || !code ? "failed" : callback?.state === state ? callback.status : "connecting";
  return (
    <p className={className}>
      {status === "connected"
        ? l("remote.connected")
        : status === "connecting"
          ? l("remote.connecting")
          : l(error === "access_denied" ? "remote.denied" : "remote.failed")}
    </p>
  );
};

interface ScreenProps {
  className?: string;
  url: string;
  tool: string;
  args: Record<string, unknown>;
  href?: string;
  /** Whether the server draws this tool as script-less HTML; without it the card is its link alone. */
  drawn?: boolean;
  height?: number;
}
// Security: the HTML is another server's, so it is drawn in a frame that runs no script and shares no origin, and the
// server's name and the way out are drawn here, outside it, where that HTML cannot imitate them.
export const Screen = ({ className, url, tool, args, href, drawn = true, height = 320 }: ScreenProps) => {
  const { l } = usePage();
  const card = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(drawn ? null : "");
  const host = URL.parse(url)?.host ?? url;
  const link = href && URL.parse(href)?.host === host ? href : null;
  const argsKey = JSON.stringify(args);
  useEffect(() => {
    if (!drawn || !card.current) return;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      seen.disconnect();
      fetch.remoteScreen(url, tool, argsKey).then(setHtml, () => setHtml(""));
    });
    seen.observe(card.current);
    return () => seen.disconnect();
  }, [url, tool, argsKey, drawn]);
  return (
    <div ref={card} className={cn("overflow-hidden rounded-box border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-border border-b px-3 py-1.5 text-muted-foreground text-xs">
        <span className="truncate font-mono">{host}</span>
        {link ? (
          <a className="shrink-0 text-primary hover:underline" href={link} target="_blank" rel="noopener noreferrer">
            {l("remote.open")} ↗
          </a>
        ) : null}
      </div>
      {html ? (
        <iframe
          className="block w-full bg-background"
          title={`${host} ${tool}`}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          height={height}
          srcDoc={html}
        />
      ) : (
        <p className="px-3 py-4 text-center text-muted-foreground text-sm">
          {html === null ? l("remote.connecting") : l("remote.screenUnavailable")}
        </p>
      )}
    </div>
  );
};
