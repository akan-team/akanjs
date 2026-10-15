import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

export class BannerFilter extends from(cnst.Banner, (filter) => ({
  query: {
    onDisplay: filter()
      .opt("category", String)
      .query((category, q) => {
        const now = new Date();
        return q.all(
          ...(category ? [{ category }] : []),
          { from: q.lte(now) },
          q.any(q.empty("to"), { to: q.gte(now) }),
        );
      }),
  },
  sort: {},
})) {}

export class Banner extends by(cnst.Banner) {}

export class BannerModel extends into(Banner, BannerFilter, cnst.banner, () => ({})) {}
