import type { Location } from "akanjs/client";
import { CsrGuards } from "./CsrGuards";

interface CsrRefreshRequest {
  epoch: number;
  locationId: string | null;
}

export class CsrRefresh {
  static #request: CsrRefreshRequest = { epoch: 0, locationId: null };
  static readonly #listeners = new Set<() => void>();

  static idOf({ entryId, href }: Pick<Location, "entryId" | "href">): string {
    return `${entryId ?? ""} ${href}`;
  }

  //? A server render runs a route's guards again, so a refresh drops the verdict its layers drew under.
  static request(location: Location) {
    if (CsrGuards.declared(location)) CsrGuards.expire(location);
    CsrRefresh.#request = { epoch: CsrRefresh.#request.epoch + 1, locationId: CsrRefresh.idOf(location) };
    for (const listener of CsrRefresh.#listeners) listener();
  }

  static subscribe(listener: () => void): () => void {
    CsrRefresh.#listeners.add(listener);
    return () => {
      CsrRefresh.#listeners.delete(listener);
    };
  }

  static current(): CsrRefreshRequest {
    return CsrRefresh.#request;
  }
}
