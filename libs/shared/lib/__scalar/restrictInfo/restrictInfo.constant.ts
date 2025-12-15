import { via } from "@akanjs/constant";

export class RestrictInfo extends via((field) => ({
  until: field(Date),
  reason: field(String),
})) {}
