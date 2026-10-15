import type { NestedKeysWithAllowed } from "akanjs/base";
import { ConstantRegistry, type QueryOf } from "akanjs/constant";
import { DatabaseRegistry, DocumentSchema } from "akanjs/document";
import { DatabaseAdaptorRole, serve } from "akanjs/service";
import type * as cnst from "../cnst";
import * as db from "../db";
import { SummaryModel } from "./summary.document";

export class SummaryService extends serve(db.summary, ({ plug }) => ({
  database: plug(DatabaseAdaptorRole),
})) {
  async makeSummary(archiveType: "periodic" | "non-periodic" = "non-periodic"): Promise<db.Summary> {
    const data = await this.summarize();
    return await this.summaryModel.archive(archiveType, data);
  }
  async summarize() {
    const keyValues = await Promise.all(
      SummaryModel.countedFields().map(async ([key, queryMeta]) => {
        const value = await this.countWithQuery(queryMeta.refName, SummaryModel.queryOf(key, queryMeta));
        return [key, value] as [string, number];
      }),
    );
    return Object.fromEntries(keyValues);
  }
  async countWithQuery(refName: string, query: QueryOf<unknown>) {
    const database = DatabaseRegistry.getDatabase(refName);
    const schema = new DocumentSchema();
    database.model._onSchema(schema);
    database.model._libsOnSchema(schema);
    return await this.database.getStore(ConstantRegistry.getDatabase(refName), database, schema).count(query);
  }

  async moveValue(
    decField: NestedKeysWithAllowed<cnst.Summary, number>,
    incField: NestedKeysWithAllowed<cnst.Summary, number>,
    value = 1,
  ) {
    return await this.summaryModel.moveValue(decField, incField, value);
  }
  async incValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value = 1) {
    return await this.summaryModel.incValue(field, value);
  }
  async decValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value = 1) {
    return await this.summaryModel.decValue(field, value);
  }
  async setValue(field: NestedKeysWithAllowed<cnst.Summary, number>, value: number) {
    return await this.summaryModel.setValue(field, value);
  }
  async getActiveSummary() {
    const active = await this.summaryModel.findByStatuses(["active"]);
    if (active) return active;
    await this.makeSummary();
    return await this.summaryModel.pickByStatuses(["active"]);
  }
}
