import type { QueryMeta } from "@libs/shared/common";
import { type Cls, FIELD_META, Float, Int, type NestedKeysWithAllowed } from "akanjs/base";
import { DatabaseRegistry, getFilterInfoByKey } from "akanjs/document";
import { serve } from "akanjs/service";
import * as cnst from "../cnst";
import * as db from "../db";
import { Err } from "../dict";

export class SummaryService extends serve(db.summary, () => ({})) {
  summary!: db.Summary;

  async makeSummary(archiveType: "periodic" | "non-periodic" = "non-periodic"): Promise<db.Summary> {
    const data = await this.summarize();
    return await this.summaryModel.archive(archiveType, data);
  }
  async summarize() {
    const queryFieldMetas = Object.entries(cnst.Summary[FIELD_META])
      .filter(([_, field]) => !!field.meta.queryKey)
      .filter(([_, field]) => (field.modelRef as Cls) === Int || (field.modelRef as Cls) === Float);
    const keyValues = await Promise.all(
      queryFieldMetas.map(async ([key, field]) => {
        const queryMeta = field.meta as QueryMeta;
        const queryKey = queryMeta.queryKey;
        const args = queryMeta.queryArgs;
        if (!queryKey) throw new Err("summary.error.queryKeyNotDefined", { key });
        const filterRef = DatabaseRegistry.getDatabase(queryMeta.refName).filter;
        const query = (getFilterInfoByKey(filterRef, queryKey).queryFn as (...args: object[]) => object)(
          ...((typeof args === "function" ? args() : args) as object[]),
        );
        const value = await this.summaryModel.countWithQuery(queryMeta.refName, query);
        return [key, value] as [string, number];
      }),
    );
    return Object.fromEntries(keyValues);
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
    this.summary =
      (await this.summaryModel.findByStatuses(["active"])) ??
      (await this.summaryModel.createSummary({ type: "non-periodic", status: "active" }));
    return this.summary;
  }
}
