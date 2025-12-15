import { beyond, by, from, into, type SchemaOf } from "@akanjs/document";

import * as cnst from "../cnst";

export class BannerFilter extends from(cnst.Banner, (filter) => ({
  query: {
    inCategory: filter()
      .opt("category", String)
      .query((category) => ({ category })),
  },
  sort: {},
})) {}

export class Banner extends by(cnst.Banner) {}

export class BannerModel extends into(Banner, BannerFilter, cnst.banner, () => ({})) {}

export class BannerMiddleware extends beyond(BannerModel, Banner) {
  onSchema(schema: SchemaOf<BannerModel, Banner>) {
    // schema.index({ status: 1 })
  }
}
