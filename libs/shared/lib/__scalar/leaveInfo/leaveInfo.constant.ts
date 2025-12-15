import { dayjs, enumOf, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class LeaveType extends enumOf("leaveType", ["noReply", "comeback", "unsatisfied", "other"] as const) {}

export class LeaveInfo extends via((field) => ({
  type: field(LeaveType, { default: "noReply" }),
  reason: field(String).optional(),
  satisfaction: field(Int, { min: 1, max: 5 }).optional(),
  voc: field(String).optional(),
  at: field(Date, { default: () => dayjs() }),
})) {}
