import { safeExternalUrl } from "./url";

/**
 * Embed provider resolution — pure (depends only on the URL guard), so it is unit
 * testable without pulling the upload transport or `@lexical/react`.
 */
export type EmbedProviderType = "youtube" | "vimeo";

export interface ResolvedEmbed {
  type: EmbedProviderType;
  embedUrl: string;
}

const isHostOrSubdomainOf = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

/**
 * Resolves a user-pasted URL to a safe provider embed URL, or `null` when the
 * URL is unsafe, unsupported, or the provider is not in `allowedProviders`.
 * Mirrors the Yoopta embed policy (`allowedEmbedProviders`, default youtube/vimeo).
 */
export const resolveEmbed = (rawUrl: string, allowedProviders: string[]): ResolvedEmbed | null => {
  const safe = safeExternalUrl(rawUrl);
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.replace(/^www\./, "");

  if (allowedProviders.includes("youtube")) {
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1);
    else if (isHostOrSubdomainOf(host, "youtube.com")) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) {
        id = url.pathname.split("/")[2] ?? null;
      }
    }
    if (id) return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
  }

  if (allowedProviders.includes("vimeo") && isHostOrSubdomainOf(host, "vimeo.com")) {
    const id = url.pathname.split("/").filter(Boolean).pop();
    if (id && /^\d+$/.test(id)) return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }

  return null;
};
