// Kept free of akanjs/base: the RSC client bundles this file, and the base barrel would ride along into it.

/** The pre-scoping key. Read as a fallback, never written; drop it once deployments have rotated past it. */
export const legacyAuthTokenKey = "jwt";

/** Matches both spellings so a signout can sweep a jar written before and after the key was scoped. */
export const isAuthTokenKey = (key: string): boolean =>
  key === legacyAuthTokenKey || key.startsWith(`${legacyAuthTokenKey}:`);

const authCookiePattern = new RegExp(`(?:^|;\\s*)${legacyAuthTokenKey}(?::[^=\\s;]+)?=`);

export const cookieHeaderHasAuthToken = (cookieHeader: string | null | undefined): boolean =>
  !!cookieHeader && authCookiePattern.test(cookieHeader);
