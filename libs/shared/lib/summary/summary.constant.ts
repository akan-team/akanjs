import { dayjs, enumOf, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";
import { getQueryMeta } from "@shared/common";

import { UserFilter } from "../user/user.document";

export class SummaryStatus extends enumOf("summaryStatus", ["active", "archived"]) {}

export class PeriodType extends enumOf("periodType", [
  "non-periodic",
  "active",
  "hourly",
  "daily",
  "weekly",
  "monthly",
]) {}

export class SummaryInput extends via((field) => ({
  type: field(PeriodType, { default: "non-periodic" }),
})) {}

export class SummaryObject extends via(SummaryInput, (field) => ({
  at: field(Date, { default: () => dayjs() }),
  status: field(SummaryStatus, { default: "archived" }),
  prepareUser: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byStatuses")
      .args([["prepare"]])
  ),
  activeUser: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byStatuses")
      .args([["active"]])
  ),
  dormantUser: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byStatuses")
      .args([["dormant"]])
  ),
  restrictedUser: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byStatuses")
      .args([["restricted"]])
  ),
  hau: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byLoginAt")
      .args(() => [dayjs().subtract(1, "hour")])
  ),
  dau: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byLoginAt")
      .args(() => [dayjs().subtract(1, "day")])
  ),
  wau: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byLoginAt")
      .args(() => [dayjs().subtract(1, "week")])
  ),
  mau: field(Int, { default: 0 }).meta(
    getQueryMeta<UserFilter>("user")
      .query("byLoginAt")
      .args(() => [dayjs().subtract(1, "month")])
  ),
})) {}

export class LightSummary extends via(SummaryObject, ["at"] as const, (resolve) => ({})) {}

export class Summary extends via(SummaryObject, LightSummary, (resolve) => ({})) {
  static getPeriodicType(now = new Date()): ["monthly" | "weekly" | "daily" | "hourly", Date] {
    now.setMinutes(0, 0, 0);
    const [hour, weekDay, date] = [now.getHours(), now.getDay(), now.getDate()];
    const type =
      date === 1 && hour === 0 ? "monthly" : weekDay === 0 && hour === 0 ? "weekly" : hour === 0 ? "daily" : "hourly";
    return [type, now];
  }
}

export class SummaryInsight extends via(Summary, (field) => ({})) {}
