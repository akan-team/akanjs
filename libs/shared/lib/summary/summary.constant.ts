import { getQueryMeta } from "@libs/shared/common";
import { dayjs, enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

import type { UserFilter } from "../user/user.document";

export class SummaryStatus extends enumOf("summaryStatus", ["active", "archived"] as const) {}

export class PeriodType extends enumOf("periodType", [
  "non-periodic",
  "active",
  "hourly",
  "daily",
  "weekly",
  "monthly",
] as const) {}

export class SummaryInput extends via((field) => ({
  type: field(PeriodType, { default: "non-periodic" }),
})) {}

export class SummaryObject extends via(SummaryInput, (field) => ({
  at: field(Date, { default: () => dayjs() }),
  status: field(SummaryStatus, { default: "archived" }),
  prepareUser: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byStatuses")
      .args([["prepare"]]),
  ),
  activeUser: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byStatuses")
      .args([["active"]]),
  ),
  dormantUser: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byStatuses")
      .args([["dormant"]]),
  ),
  restrictedUser: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byStatuses")
      .args([["restricted"]]),
  ),
  hau: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byLoginAt")
      .args(() => [dayjs().subtract(1, "hour")]),
  ),
  dau: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byLoginAt")
      .args(() => [dayjs().subtract(1, "day")]),
  ),
  wau: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byLoginAt")
      .args(() => [dayjs().subtract(1, "week")]),
  ),
  mau: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byLoginAt")
      .args(() => [dayjs().subtract(1, "month")]),
  ),
})) {}

export class LightSummary extends via(SummaryObject, ["at"] as const, (resolve) => ({})) {}

export class Summary extends via(SummaryObject, LightSummary, (resolve) => ({})) {
  static getPeriodicType(now = new Date()): ["monthly" | "weekly" | "daily" | "hourly", Date] {
    const at = new Date(now);
    at.setMinutes(0, 0, 0);
    const [hour, weekDay, date] = [at.getHours(), at.getDay(), at.getDate()];
    const type =
      date === 1 && hour === 0 ? "monthly" : weekDay === 0 && hour === 0 ? "weekly" : hour === 0 ? "daily" : "hourly";
    return [type, at];
  }
}

export class SummaryInsight extends via(Summary, (field) => ({})) {}
