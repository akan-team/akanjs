import type { QueryMeta } from "@libs/shared/common";
import { type Cls, type Dayjs, dayjs, FIELD_META, Float, Int, type NestedKeysWithAllowed } from "akanjs/base";
import type { QueryOf } from "akanjs/constant";
import {
  by,
  DatabaseRegistry,
  fillMissingFilterArgs,
  from,
  getFilterInfoByKey,
  into,
  documentQueryHelper as q,
} from "akanjs/document";
import * as cnst from "../cnst";
import type * as db from "../db";
import { Err } from "../dict";

export class SummaryFilter extends from(cnst.Summary, (filter) => ({
  query: {
    byStatuses: filter()
      .opt("statuses", [cnst.SummaryStatus])
      .query((statuses, q) => (statuses?.length ? { status: q.oneOf(statuses) } : {})),
    toPeriod: filter()
      .arg("from", Date)
      .arg("to", Date)
      .opt("periodTypes", [cnst.PeriodType])
      .query((from, to, periodTypes, q) => ({
        at: q.between(from.toDate(), to.toDate()),
        type: q.oneOf(periodTypes ?? ["hourly"]),
      })),
  },
  sort: {
    oldestAt: { at: 1 },
  },
})) {}

export class Summary extends by(cnst.Summary) {}

export class SummaryModel extends into(Summary, SummaryFilter, cnst.summary, () => ({})) {
  static countedFields(): [string, QueryMeta][] {
    return Object.entries(cnst.Summary[FIELD_META])
      .filter(([_, field]) => !!field.meta.queryKey)
      .filter(([_, field]) => (field.modelRef as Cls) === Int || (field.modelRef as Cls) === Float)
      .map(([key, field]) => [key, field.meta as QueryMeta]);
  }
  static queryOf(key: string, queryMeta: QueryMeta): QueryOf<unknown> {
    const queryKey = queryMeta.queryKey;
    if (!queryKey) throw new Err("summary.error.queryKeyNotDefined", { key });
    const filterRef = DatabaseRegistry.getDatabase(queryMeta.refName).filter;
    const filterInfo = getFilterInfoByKey(filterRef, queryKey);
    if (!filterInfo.queryFn) throw new Err("summary.error.queryFnNotDefined", { key });
    const args = queryMeta.queryArgs;
    const buildQuery = filterInfo.queryFn as (...args: unknown[]) => QueryOf<unknown>;
    return buildQuery(...fillMissingFilterArgs(filterInfo, typeof args === "function" ? args() : args), q);
  }
  //? Hour plus type as the id: a second writer of the same hour hits the primary key instead of storing it twice.
  static archivedIdOf(type: cnst.PeriodType["value"], at: Dayjs) {
    const hourHex = Math.floor(at.valueOf() / 1000)
      .toString(16)
      .padStart(8, "0");
    return `${hourHex}${"0".repeat(10)}${cnst.PeriodType.indexOf(type).toString(16).padStart(6, "0")}`;
  }
  // active rows collapse into the newest, rewritten as type `active`; a periodic call also upserts this hour's archive.
  async archive(archiveType: "periodic" | "non-periodic", data: Omit<db.SummaryInput, "type">) {
    const [type, at] = cnst.Summary.getPeriodicType();
    const periodAt = dayjs(at);
    const [active, ...duplicates] = await this.Summary.find({ status: "active" });
    if (active && duplicates.length)
      await this.Summary.removeMany(q.all({ status: "active" }, { id: q.ne(active.id) }));
    await (active
      ? active.set({ ...data, type: "active", at: periodAt, status: "active" }).save()
      : new this.Summary({ ...data, type: "active", at: periodAt, status: "active" }).save());
    if (archiveType === "non-periodic") return await new this.Summary(data).save();
    const id = SummaryModel.archivedIdOf(type, periodAt);
    const archived =
      (await this.Summary.findById(id)) ?? (await this.Summary.findOne({ status: "archived", type, at: periodAt }));
    return await (archived
      ? archived.set({ ...data, at: periodAt, status: "archived" }).save()
      : this.createSummary({ ...data, id, type, at: periodAt, status: "archived" }));
  }
  async moveValue(
    decField: NestedKeysWithAllowed<cnst.Summary, number>,
    incField: NestedKeysWithAllowed<cnst.Summary, number>,
    value = 1,
  ) {
    const { modifiedCount } = await this.Summary.updateOne({ status: "active" }, ({ inc }) => ({
      [decField]: inc(-value),
      [incField]: inc(value),
    }));
    return !!modifiedCount;
  }
  async incValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value = 1) {
    const { modifiedCount } = await this.Summary.updateOne({ status: "active" }, ({ inc }) => ({
      [field]: inc(value),
    }));
    return !!modifiedCount;
  }
  async decValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value = 1) {
    const { modifiedCount } = await this.Summary.updateOne({ status: "active" }, ({ inc }) => ({
      [field]: inc(-value),
    }));
    return !!modifiedCount;
  }
  async setValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value: number) {
    const { modifiedCount } = await this.Summary.updateOne({ status: "active" }, { [field]: value });
    return !!modifiedCount;
  }
}
