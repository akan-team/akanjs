import { dayjs, enumOf } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class Journey extends enumOf("journey", [
  "welcome",
  "waiting",
  "firstJoin",
  "joined",
  "leaving",
  "leaved",
  "returning",
  "returned",
] as const) {}

export class Inquiry extends enumOf("inquiry", [
  "welcome",
  "payable",
  "waitPay",
  "paid",
  "morePayable",
  "waitMorePay",
  "inquired",
  "concerned",
  "concernedPayable",
  "concernedWaitPay",
  "ashed",
  "vip",
  "kicked",
] as const) {}

export class EncourageInfo extends via((field) => ({
  journey: field(Journey, { default: "welcome" }),
  journeyAt: field(Date, { default: () => dayjs() }),
  inquiry: field(Inquiry, { default: "welcome" }),
  inquiryAt: field(Date, { default: () => dayjs() }),
})) {}
