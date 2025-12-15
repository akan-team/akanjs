import { dayjs, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

import { Coordinate } from "../coordinate/coordinate.constant";

export class AccessLog extends via((field) => ({
  period: field(Int, { default: 0 }),
  countryCode: field(String).optional(),
  countryName: field(String).optional(),
  city: field(String).optional(),
  postal: field(Int).optional(),
  location: field(Coordinate).optional(),
  ipv4: field(String).optional(),
  state: field(String).optional(),
  osName: field(String).optional(),
  osVersion: field(String).optional(),
  browserName: field(String).optional(),
  browserVersion: field(String).optional(),
  mobileModel: field(String).optional(),
  mobileVendor: field(String).optional(),
  deviceType: field(String).optional(),
  at: field(Date, { default: () => dayjs() }),
})) {}
