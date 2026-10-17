import { adapt } from "../adapt";
import { EndpointCacheKeys } from "../endpointCacheKeys";
import { CacheAdaptorRole } from "./role.adaptor";

/** Drops an endpoint's `{ cache }` answers before their TTL, across instances: every entry, or the one for `args`. */
export class EndpointCacheControl extends adapt("endpointCacheControl", ({ plug }) => ({
  cache: plug(CacheAdaptorRole),
})) {
  /** `args` are the endpoint's arguments in declared order, as it receives them. Answers false when the cache failed. */
  async invalidate(endpoint: string, args?: unknown[]): Promise<boolean> {
    try {
      await EndpointCacheKeys.invalidate(this.cache, endpoint, args);
      return true;
    } catch (error) {
      this.logger.warn(`Cache invalidation failed for ${endpoint}: ${String(error)}`);
      return false;
    }
  }
}
