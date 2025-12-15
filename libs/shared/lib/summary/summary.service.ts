import { Float, Int, type NestedKeysWithAllowed } from "@akanjs/base";
import { getFieldMetas } from "@akanjs/constant";
import { documentInfo, getFilterMeta, getFilterQuery } from "@akanjs/document";
import { serve } from "@akanjs/service";
import { QueryMeta } from "@shared/common";

import * as cnst from "../cnst";
import * as db from "../db";

export class SummaryService extends serve(db.summary, () => ({})) {
  summary: db.Summary;

  async makeSummary(archiveType: "periodic" | "non-periodic" = "non-periodic"): Promise<db.Summary> {
    const data = await this.summarize();
    return await this.summaryModel.archive(archiveType, data);
  }
  async summarize() {
    const fieldMetas = getFieldMetas(cnst.Summary);
    const queryFieldMetas = fieldMetas
      .filter((fieldMeta) => !!fieldMeta.meta.filterRef)
      .filter((fieldMeta) => fieldMeta.modelRef === Int || fieldMeta.modelRef === Float);
    const keyValues = await Promise.all(
      queryFieldMetas.map(async (fieldMeta) => {
        const queryMeta = fieldMeta.meta as QueryMeta;
        const key = queryMeta.queryKey;
        const args = queryMeta.queryArgs;
        const filterRef = documentInfo.getDatabase(queryMeta.refName).filter;
        const query = getFilterQuery(filterRef, key)(...((typeof args === "function" ? args() : args) as object[]));
        const modelName = getFilterMeta(filterRef).refName.slice(0, -6); // remove "Filter"
        const value = await this.summaryModel.countWithQuery(modelName, query);
        return [fieldMeta.key, value] as [string, number];
      })
    );
    return Object.fromEntries(keyValues);
  }

  async moveValue(
    decField: NestedKeysWithAllowed<cnst.Summary, number>,
    incField: NestedKeysWithAllowed<cnst.Summary, number>,
    value = 1
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
