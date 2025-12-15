import { Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class ServiceReview extends via((field) => ({
  score: field(Int, { min: 0, default: 0 }),
  comment: field(String).optional(),
})) {}
