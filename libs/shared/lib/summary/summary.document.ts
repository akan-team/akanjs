import { dayjs, type NestedKeysWithAllowed } from "akanjs/base";
import type { QueryOf } from "akanjs/constant";
import { by, documentQueryHelper, from, into, type Mdl } from "akanjs/document";
import * as cnst from "../cnst";
import type * as db from "../db";
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
  async archive(archiveType: "periodic" | "non-periodic", data: Omit<db.SummaryInput, "type">) {
    const [type, at] = cnst.Summary.getPeriodicType();
    const periodAt = dayjs(at);
    if ((await this.Summary.countDocuments({ status: "active" })) > 1) {
      const summary = await this.Summary.pickOne({ status: "active" });
      const q = documentQueryHelper;
      await this.Summary.deleteMany(q.all({ status: "active" }, { id: q.ne(summary.id) }));
    }
    await this.Summary.updateOne(
      { status: "active", type: "active" },
      { ...data, type: "active", at, status: "active" },
      { upsert: true },
    );
    if (archiveType === "non-periodic") return await new this.Summary(data).save();
    await this.Summary.updateOne(
      { status: "archived", type, at: periodAt },
      { ...data, type, at: periodAt, status: "archived" },
      { upsert: true },
    );
    return await this.Summary.pickOne({ status: "archived", type, at: periodAt });
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
      [field]: inc(value),
    }));
    return !!modifiedCount;
  }
  async setValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value: number) {
    const { modifiedCount } = await this.Summary.updateOne({ status: "active" }, { [field]: value });
    return !!modifiedCount;
  }
  async countWithQuery(modelName: string, query: QueryOf<any>) {
    const model = (this.Summary as any).db.model(modelName) as Mdl<any, any>;
    const count = await model.countDocuments(query);
    return count;
  }
}
