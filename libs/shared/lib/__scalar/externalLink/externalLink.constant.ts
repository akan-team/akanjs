import { enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class LinkType extends enumOf("linkType", [
  "website",
  "twitter",
  "discord",
  "telegram",
  "instagram",
  "facebook",
  "youtube",
  "github",
  "medium",
  "linkedin",
  "reddit",
  "twitch",
  "vimeo",
  "weibo",
  "wikipedia",
  "app",
  "email",
  "other",
] as const) {}

export class ExternalLink extends via((field) => ({
  type: field(LinkType),
  url: field(String),
})) {}
