import { dayjs, enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

export const unsetDate = dayjs(new Date("0000"));
export const MAX_INT = 2147483647;

export class Responsive extends enumOf("responsive", ["xl", "lg", "md", "sm", "xs"] as const) {}
export const responsiveWidths = [1200, 992, 768, 576, 0] as const;

export class AccessToken extends via((field) => ({
  jwt: field(String),
})) {}
