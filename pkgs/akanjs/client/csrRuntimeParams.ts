import { csrLocation } from "./csrLocation";
import { Href } from "./href";

/** The params a CSR boot reads off its address (`?csr=true`), which every address it moves to carries along. */
export class CsrRuntimeParams {
  static readonly #names = ["csr", "akanMobileTarget", "akanMobileBasePath", "akanMobileIndexPath"] as const;

  static carry(href: string) {
    const currentSearch = new URLSearchParams(csrLocation.search);
    if (currentSearch.get("csr") !== "true" || Href.hasWebScheme(href)) return href;

    const [hrefWithoutHash, hash = ""] = href.split("#");
    const [pathname, search = ""] = hrefWithoutHash.split("?");
    const nextSearch = new URLSearchParams(search);
    for (const param of CsrRuntimeParams.#names) {
      if (nextSearch.has(param)) continue;
      const value = currentSearch.get(param);
      if (value !== null) nextSearch.set(param, value);
    }
    const query = nextSearch.toString();
    return `${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  }

  static sameRoute(a: string, b: string) {
    const [left, right] = [a, b].map((href) => {
      const url = new URL(href, "http://route.invalid");
      for (const param of CsrRuntimeParams.#names) url.searchParams.delete(param);
      url.searchParams.sort();
      return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
    });
    return left === right;
  }
}
