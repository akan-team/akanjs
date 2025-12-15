import { Public } from "@akanjs/nest";
import { endpoint, internal, slice } from "@akanjs/signal";
import { Admin } from "@shared/nest";

import * as srv from "../srv";

export class BannerInternal extends internal(srv.banner, () => ({})) {}

export class BannerSlice extends slice(srv.banner, { guards: { root: Admin, get: Public, cru: Admin } }, (init) => ({
  inPublic: init()
    .search("category", String)
    .exec(function (category) {
      return this.bannerService.queryInCategory(category);
    }),
})) {}

export class BannerEndpoint extends endpoint(srv.banner, () => ({})) {}
