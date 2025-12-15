"use client";
import { st } from "@akanjs/store";
import { useEffect } from "react";

declare const window: {
  gtag?: (...args: any[]) => void;
  debugMode?: boolean;
};

export const Gtag = ({ trackingId, debugMode = false }: { trackingId: string; debugMode?: boolean }) => {
  const pathname = st.use.pathname();
  const searchParams = st.use.searchParams();
  // https://developers.google.com/analytics/devguides/collection/gtagjs/pages
  const pageview = (url: string) => {
    window.gtag?.("config", trackingId, { page_path: url });
  };

  // https://developers.google.com/analytics/devguides/collection/gtagjs/events
  const event = ({
    action,
    category,
    label,
    value,
  }: {
    action: string;
    category: string;
    label: string;
    value: number;
  }) => {
    window.gtag?.("event", action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  };
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      pageview(url);
    };
    handleRouteChange(
      pathname + (Object.keys(searchParams).length ? new URLSearchParams(searchParams).toString() : "")
    );
    // const url = pathname + searchParams?.toString();
    // handleRouteChange(url);
  }, [pathname, searchParams]);

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${trackingId}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${trackingId}', {
      page_path: window.location.pathname,
      debug_mode: ${debugMode},
    });
  `,
        }}
      />
    </>
  );
};
