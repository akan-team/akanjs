// Kept free of akanjs/base: the RSC client bundles this file, and the base barrel would ride along into it.

/** The pre-scoping key. Never read or written; sign-in and sign-out still delete it from jars written before. */
export const legacyAuthTokenKey = "jwt";

/** Matches every spelling, bare, app-scoped or `__Host-`, so a signout can sweep a jar written under any of them. */
export const isAuthTokenKey = (key: string): boolean => {
  const name = key.startsWith("__Host-") ? key.slice("__Host-".length) : key;
  return name === legacyAuthTokenKey || name.startsWith(`${legacyAuthTokenKey}:`);
};

const authCookiePattern = new RegExp(`(?:^|;\\s*)(?:__Host-)?${legacyAuthTokenKey}(?::[^=\\s;]+)?=`);

/** @deprecated Unused by the framework; parse the header with `CookieJar.parse` and test its `names()`. */
export const cookieHeaderHasAuthToken = (cookieHeader: string | null | undefined): boolean =>
  !!cookieHeader && authCookiePattern.test(cookieHeader);
