import { Dayjs, dayjs } from "@akanjs/base";
import { store } from "@akanjs/store";

import * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class SummaryStore extends store(sig.summary, {
  // state
  summaryListInRange: [] as cnst.LightSummary[],
  summaryListInHourly: [] as cnst.LightSummary[],
  summaryListInDaily: [] as cnst.LightSummary[],
  summaryListInWeekly: [] as cnst.LightSummary[],
  summaryListInMonthly: [] as cnst.LightSummary[],
  summaryListInHau: [] as cnst.LightSummary[],
  summaryListInDau: [] as cnst.LightSummary[],
  summaryListInWau: [] as cnst.LightSummary[],
  summaryListInMau: [] as cnst.LightSummary[],
  fromByHourly: dayjs().subtract(7, "day"),
  fromByDaily: dayjs().subtract(7, "day"),
  fromByMonthly: dayjs().subtract(6, "month"),
  toByHourly: dayjs(),
  toByDaily: dayjs(),
  toByMonthly: dayjs(),
}) {
  async getActiveSummary() {
    this.set({ summary: await fetch.getActiveSummary(), summaryLoading: false });
  }
  async getSummaryListInPeriod({
    from,
    to,
    periodTypes,
  }: {
    from: Dayjs;
    to: Dayjs;
    periodTypes: cnst.PeriodType["value"][];
  }) {
    const summaryListInPeriod = await fetch.summaryListInPeriod(from, to, periodTypes, 0, 0, null);
    this.set({ summaryListInRange: summaryListInPeriod });
  }
  async getSummaryListInHourly(from: Dayjs, to: Dayjs) {
    const summaryListInHourly = await fetch.summaryListInPeriod(
      from,
      to,
      ["hourly", "daily", "weekly", "monthly"],
      0,
      0,
      "oldestAt"
    );
    this.set({ summaryListInHourly });
  }
  async getSummaryListInDaily(from: Dayjs, to: Dayjs) {
    const summaryListInDaily = await fetch.summaryListInPeriod(
      from,
      to,
      ["daily", "weekly", "monthly"],
      0,
      0,
      "oldestAt"
    );
    this.set({ summaryListInDaily });
  }
  async getSummaryListInWeekly(from: Dayjs, to: Dayjs) {
    const summaryListInWeekly = await fetch.summaryListInPeriod(from, to, ["weekly", "monthly"], 0, 0, "oldestAt");
    this.set({ summaryListInWeekly });
  }
  async getSummaryListInMonthly(from: Dayjs, to: Dayjs) {
    const summaryListInMonthly = await fetch.summaryListInPeriod(from, to, ["monthly"], 0, 0, "oldestAt");
    this.set({ summaryListInMonthly });
  }

  async getSummaryListInHau({
    from,
    to,
    periodTypes,
  }: {
    from: Dayjs;
    to: Dayjs;
    periodTypes: cnst.PeriodType["value"][];
  }) {
    const summaryListInHau = await fetch.summaryListInPeriod(from, to, periodTypes, 0, 0, null);
    this.set({ summaryListInHau });
  }
  async getSummaryListInDau({
    from,
    to,
    periodTypes,
  }: {
    from: Dayjs;
    to: Dayjs;
    periodTypes: cnst.PeriodType["value"][];
  }) {
    const summaryListInDau = await fetch.summaryListInPeriod(from, to, periodTypes, 0, 0, null);
    this.set({ summaryListInDau });
  }
  async getSummaryListInWau({
    from,
    to,
    periodTypes,
  }: {
    from: Dayjs;
    to: Dayjs;
    periodTypes: cnst.PeriodType["value"][];
  }) {
    const summaryListInWau = await fetch.summaryListInPeriod(from, to, periodTypes, 0, 0, null);
    this.set({ summaryListInWau });
  }
  async getSummaryListInMau({
    from,
    to,
    periodTypes,
  }: {
    from: Dayjs;
    to: Dayjs;
    periodTypes: cnst.PeriodType["value"][];
  }) {
    const summaryListInMau = await fetch.summaryListInPeriod(from, to, periodTypes, 0, 0, null);
    this.set({ summaryListInMau });
  }

  setPeriodAll(from: Dayjs, to: Dayjs) {
    this.set({
      fromByHourly: from,
      toByHourly: to,
      fromByDaily: from,
      toByDaily: to,
      fromByMonthly: from,
      toByMonthly: to,
    });
  }
}
