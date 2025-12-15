import { Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class AccessStat extends via((field) => ({
  request: field(Int, { default: 0 }),
  device: field(Int, { default: 0 }),
  ip: field(Int, { default: 0 }),
  country: field(Int, { default: 0 }),
})) {}
