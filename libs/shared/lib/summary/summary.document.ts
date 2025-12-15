import type { NestedKeysWithAllowed } from "@akanjs/base";
import { beyond, by, from, into, Mdl, QueryOf, type SchemaOf } from "@akanjs/document";

import * as cnst from "../cnst";
import type * as db from "../db";

export class SummaryFilter extends from(cnst.Summary, (filter) => ({
  query: {
    byStatuses: filter()
      .opt("statuses", [cnst.SummaryStatus])
      .query((statuses) => (statuses?.length ? { status: { $in: statuses } } : {})),
    toPeriod: filter()
      .arg("from", Date)
      .arg("to", Date)
      .opt("periodTypes", [cnst.PeriodType])
      .query((from, to, periodTypes) => ({
        at: { $gte: from.toDate(), $lte: to.toDate() },
        type: { $in: periodTypes ?? ["hourly"] },
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
    if ((await this.Summary.countDocuments({ status: "active" })) > 1) {
      const summary = await this.Summary.pickOne({ status: "active" });
      await this.Summary.deleteMany({ status: "active", _id: { $ne: summary._id } });
    }
    await this.Summary.updateOne(
      { status: "active", type: "active" },
      { ...data, type: "active", at, status: "active" },
      { upsert: true }
    );
    if (archiveType === "non-periodic") return await new this.Summary(data).save();
    await this.Summary.updateOne(
      { status: "archived", type, at },
      { ...data, type, at, status: "archived" },
      { upsert: true }
    );
    return await this.Summary.pickOne({ status: "archived", type, at });
  }
  async moveValue(
    decField: NestedKeysWithAllowed<cnst.Summary, number>,
    incField: NestedKeysWithAllowed<cnst.Summary, number>,
    value = 1
  ) {
    const { modifiedCount } = await this.Summary.updateOne(
      { status: "active" },
      { $inc: { [decField]: -value, [incField]: value } }
    );
    return !!modifiedCount;
  }
  async incValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value = 1) {
    const { modifiedCount } = await this.Summary.updateOne({ status: "active" }, { $inc: { [field]: value } });
    return !!modifiedCount;
  }
  async decValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value = 1) {
    const { modifiedCount } = await this.Summary.updateOne({ status: "active" }, { $inc: { [field]: value } });
    return !!modifiedCount;
  }
  async setValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value: number) {
    const { modifiedCount } = await this.Summary.updateOne({ status: "active" }, { $set: { [field]: value } });
    return !!modifiedCount;
  }
  async countWithQuery(modelName: string, query: QueryOf<any>) {
    const model = this.Summary.db.model(modelName) as Mdl<any, any>;
    const count = await model.countDocuments(query);
    return count;
  }
}

export class SummaryMiddleware extends beyond(SummaryModel, Summary) {
  onSchema(schema: SchemaOf<SummaryModel, Summary>) {
    // schema.index({ status: 1 })
  }
}
