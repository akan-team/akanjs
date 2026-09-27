import { dayjs, enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

import { File } from "../file/file.constant";

export class BannerStatus extends enumOf("bannerStatus", ["active", "displaying"] as const) {}

export class BannerTarget extends enumOf("bannerTarget", ["_blank", "_self"] as const) {}

export class BannerInput extends via((field) => ({
  category: field(String, { text: "tag" }).optional(),
  title: field(String, { text: "title" }).optional(),
  content: field(String, { text: "desc" }).optional(),
  image: field(File, { text: "thumb" }).optional(),
  href: field(String),
  target: field(BannerTarget, { default: "_self" }),
  from: field(Date, { default: dayjs() }),
  to: field(Date).optional(),
})) {}

export class BannerObject extends via(BannerInput, (field) => ({
  status: field(BannerStatus, { default: "active", text: "filter" }),
})) {}

export class LightBanner extends via(
  BannerObject,
  ["category", "title", "content", "image", "from", "to", "href", "target", "status"] as const,
  (resolve) => ({}),
) {}

export class Banner extends via(BannerObject, LightBanner, (resolve) => ({})) {}

export class BannerInsight extends via(Banner, (field) => ({})) {}
