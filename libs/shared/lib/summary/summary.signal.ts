import { None, Public } from "@akanjs/nest";
import { endpoint, internal, slice } from "@akanjs/signal";
import { Admin } from "@shared/nest";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class SummaryInternal extends internal(srv.summary, ({ cron }) => ({
  makeSummary: cron("0 * * * *", { serverMode: "batch", operationMode: ["cloud"] }).exec(async function () {
    await this.summaryService.makeSummary("periodic");
  }),
})) {}

export class SummarySlice extends slice(srv.summary, { guards: { root: Admin, get: Public, cru: None } }, (init) => ({
  inPeriod: init()
    .param("from", Date)
    .param("to", Date)
    .search("periodTypes", [cnst.PeriodType])
    .exec(function (from, to, periodTypes) {
      return this.summaryService.queryToPeriod(from, to, periodTypes);
    }),
})) {}

export class SummaryEndpoint extends endpoint(srv.summary, ({ query }) => ({
  getActiveSummary: query(cnst.Summary, { cache: 1000 }).exec(async function () {
    return await this.summaryService.getActiveSummary();
  }),
})) {}
