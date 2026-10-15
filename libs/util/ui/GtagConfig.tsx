"use client";
import { useEffect } from "react";

interface GtagWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}

interface GtagConfigProps {
  id: string;
}

/*
 * The bootstrap runs from an effect, not an inline `<script>`: the inline body never matched on hydration
 * (`__html` differs between the server HTML and the client prop), so React logged a mismatch on every page.
 */
export const GtagConfig = ({ id }: GtagConfigProps) => {
  useEffect(() => {
    const host = window as unknown as GtagWindow;
    if (host.gtag) return;
    host.dataLayer = host.dataLayer ?? [];
    host.gtag = function gtag() {
      // biome-ignore lint/complexity/noArguments: gtag.js only reads Arguments objects off dataLayer, so a rest array is dropped
      host.dataLayer?.push(arguments);
    };
    host.gtag("js", new Date());
    host.gtag("config", id);
  }, [id]);
  return null;
};
