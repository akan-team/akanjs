import { type Dayjs, dayjs } from "akanjs/base";
import { MAX_PAGE_SIZE } from "akanjs/constant";
import { store } from "akanjs/store";

import type * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class SummaryStore extends store(sig.summary, () => ({
  // state
  summaryListInHourly: [] as cnst.LightSummary[],
  summaryListInDaily: [] as cnst.LightSummary[],
  fromByHourly: dayjs().subtract(7, "day"),
  toByHourly: dayjs(),
  fromByDaily: dayjs().subtract(7, "day"),
  toByDaily: dayjs(),
})) {
  async getActiveSummary() {
    this.set({ summary: await fetch.getActiveSummary(), summaryLoading: false });
  }
  async recountSummary() {
    this.set({ summaryLoading: true });
    this.set({ summary: await fetch.recountSummary(), summaryLoading: false });
  }
  //? One request answers at most MAX_PAGE_SIZE rows, one per hour or day here, so a longer range starts that many before `to`.
  async getSummaryListInHourly(from: Dayjs, to: Dayjs) {
    const earliest = to.subtract(MAX_PAGE_SIZE - 1, "hour");
    const start = from.isBefore(earliest) ? earliest : from;
    const summaryListInHourly = await fetch.summaryListInPeriod(
      start,
      to,
      ["hourly", "daily", "weekly", "monthly"],
      0,
      MAX_PAGE_SIZE,
      "oldestAt",
    );
    this.set({ summaryListInHourly, ...(start === from ? {} : { fromByHourly: start }) });
  }
  async getSummaryListInDaily(from: Dayjs, to: Dayjs) {
    const earliest = to.subtract(MAX_PAGE_SIZE - 1, "day");
    const start = from.isBefore(earliest) ? earliest : from;
    const summaryListInDaily = await fetch.summaryListInPeriod(
      start,
      to,
      ["daily", "weekly", "monthly"],
      0,
      MAX_PAGE_SIZE,
      "oldestAt",
    );
    this.set({ summaryListInDaily, ...(start === from ? {} : { fromByDaily: start }) });
  }
}
