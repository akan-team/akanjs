import { adapt } from "../adapt";
import { EndpointCacheKeys } from "../endpointCacheKeys";
import { CacheAdaptorRole } from "./role.adaptor";

/** Drops an endpoint's `{ cache }` answers before their TTL, across instances: every entry, or the one for `args`. */
export class EndpointCacheControl extends adapt("endpointCacheControl", ({ plug }) => ({
  cache: plug(CacheAdaptorRole),
})) {
  /** `args`: every declared argument in order, `null` for an omitted search one; not for slice lists. */
  async invalidate(endpoint: string, args?: unknown[]): Promise<boolean> {
    try {
      await EndpointCacheKeys.invalidate(this.cache, endpoint, args);
      return true;
    } catch (error) {
      this.logger.error(`Cache invalidation failed for ${endpoint}: ${String(error)}`);
      return false;
    }
  }
}
