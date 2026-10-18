import { adapt } from "../adapt";
import { EndpointCacheKeys } from "../endpointCacheKeys";
import { CacheAdaptorRole } from "./role.adaptor";

/** Drops an endpoint's `{ cache }` answers before their TTL, across instances: every entry, or the one for `args`. */
export class EndpointCacheControl extends adapt("endpointCacheControl", ({ plug }) => ({
  cache: plug(CacheAdaptorRole),
})) {
  /**
   * `args` are every declared argument in order as the endpoint receives them, `null` for an omitted search argument;
   * a slice list also takes skip, limit and sort, so drop it with the endpoint-wide form. False when the cache failed.
   */
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
