"use client";
import { fetch, st, usePage } from "@libs/shared/client";
import { cn } from "akanjs/client";
import { McpAppHost } from "akanjs/webkit";
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

interface ViewProps {
  className?: string;
  url: string;
  tool: string;
  args: Record<string, unknown>;
  /** The view's `ui://` address, from the run's `view.resourceUri`. */
  uri: string;
  href?: string;
  height?: number;
}
// Security: the view is another server's script. It runs in a frame with no origin of its own, under a policy that
// lets it connect nowhere, and reaches only what this host relays: calls to its own server, and links there.
export const View = ({ className, url, tool, args, uri, href, height = 360 }: ViewProps) => {
  const { l } = usePage();
  const card = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [size, setSize] = useState(height);
  const host = URL.parse(url)?.host ?? url;
  const link = href && URL.parse(href)?.host === host ? href : null;
  const argsKey = JSON.stringify(args);
  useEffect(() => {
    if (!card.current) return;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      seen.disconnect();
      fetch.remoteView(url, uri).then(setHtml, () => setHtml(""));
    });
    seen.observe(card.current);
    return () => seen.disconnect();
  }, [url, uri]);
  useEffect(() => {
    if (!html) return;
    const call = (name: string, callArgs: Record<string, unknown>) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        void st.do.callRemoteView(url, name, callArgs, resolve, reject);
      });
    const theme = document.documentElement.dataset.theme;
    const appHost = new McpAppHost({
      post: (message) => frame.current?.contentWindow?.postMessage(message, "*"),
      start: () => call(tool, JSON.parse(argsKey) as Record<string, unknown>),
      callTool: call,
      openLink: (target) => {
        if (URL.parse(target)?.host !== host) return false;
        window.open(target, "_blank", "noopener,noreferrer");
        return true;
      },
      context: () => ({
        displayMode: "inline",
        locale: document.documentElement.lang || undefined,
        ...(theme === "dark" || theme === "light" ? { theme } : {}),
      }),
      onSize: setSize,
    });
    const receive = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow) appHost.receive(event.data);
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      appHost.dispose();
    };
  }, [html, url, tool, argsKey]);
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
          ref={frame}
          className="block w-full bg-background"
          title={`${host} ${tool}`}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          height={size}
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
