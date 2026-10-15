import { Admin } from "@libs/shared/srvkit";
import { endpoint, internal, Public, slice } from "akanjs/signal";
import * as srv from "../srv";

export class BannerInternal extends internal(srv.banner, () => ({})) {}

export class BannerSlice extends slice(srv.banner, { guards: { root: Admin, get: Public, cru: Admin } }, (init) => ({
  inPublic: init({ guards: [Public], mcp: false })
    .search("category", String)
    .exec(function (category) {
      return this.bannerService.queryOnDisplay(category);
    }),
})) {}

export class BannerEndpoint extends endpoint(srv.banner, ({ pubsub, query, mutation }) => ({})) {}
