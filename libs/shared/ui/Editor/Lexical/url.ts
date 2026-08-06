/**
 * Returns `url` only if it is a safe external link (http/https), else `null`.
 * Used to gate link creation (auto-link, markdown, and the Phase 2 toolbar) so
 * `javascript:` / `data:` and other schemes can never be turned into anchors.
 *
 * Framework-independent — the full upload policy from Yoopta's `Upload.ts` is
 * ported alongside this in Phase 3.
 */
export const safeExternalUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};
