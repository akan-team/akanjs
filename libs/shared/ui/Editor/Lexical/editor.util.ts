import { safeExternalUrl } from "./url";

/** Only http/https and mailto links may be created via TOGGLE_LINK_COMMAND. */
export const validateLinkUrl = (url: string) => url.startsWith("mailto:") || safeExternalUrl(url) !== null;
