import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class Responsive extends enumOf("responsive", ["xl", "lg", "md", "sm", "xs"] as const) {}

export class AccessToken extends via((field) => ({
  jwt: field(String),
  refreshToken: field(String).optional(),
  expiresAt: field(Date).optional(),
})) {}
