import { getPathInfo } from "akanjs/client";

interface ActiveHrefOptions {
  /** The current location's pathname, locale and basePath included or not. */
  pathname: string;
  href: string;
  lang: string;
  prefix: string;
  exact?: boolean;
  /** More paths that light the link, each matched as a prefix like `href`. */
  match?: string[];
}

const pathOf = (url: string, lang: string, prefix: string) => getPathInfo(url, lang, prefix).path || "/";

// By segment, so `/org` does not light up on `/organization`; `/` would match every page, so it is always exact.
const covers = (current: string, target: string, exact: boolean) =>
  exact || target === "/"
    ? current === target
    : current === target || current.startsWith(`${target.replace(/\/$/, "")}/`);

/** Whether a link to `href` is the current page, with the locale and the basePath stripped from both sides. */
export const isActiveHref = ({ pathname, href, lang, prefix, exact = false, match = [] }: ActiveHrefOptions) => {
  const current = pathOf(pathname, lang, prefix);
  return [href, ...match].some((target, idx) => covers(current, pathOf(target, lang, prefix), idx === 0 && exact));
};
