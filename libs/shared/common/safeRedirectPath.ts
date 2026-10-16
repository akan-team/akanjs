const hasControlChar = (path: string) =>
  [...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

//? A path on this site only: a browser reads `//host` and `/\host` as another host, and anything with a scheme leaves.
export const safeRedirectPath = (path: string | null | undefined, fallback = "/") =>
  path?.startsWith("/") && !/^\/[/\\]/.test(path) && !hasControlChar(path) ? path : fallback;
