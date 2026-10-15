"use client";
import { st } from "@libs/shared/client";
import { Field } from "@libs/shared/ui";
import { dayjs } from "akanjs/base";
import { capitalize } from "akanjs/common";
import { useInterval } from "akanjs/webkit";
import { useEffect } from "react";

export const Poll = () => {
  useInterval(() => {
    if (document.visibilityState === "visible") void st.do.getActiveSummary();
  }, 60_000);
  return null;
};

interface PeriodRangeProps {
  period: "hourly" | "daily";
}
export const PeriodRange = ({ period }: PeriodRangeProps) => {
  const isHourly = period === "hourly";
  const hourly = { from: st.use.fromByHourly(), to: st.use.toByHourly() };
  const daily = { from: st.use.fromByDaily(), to: st.use.toByDaily() };
  const { from, to } = isHourly ? hourly : daily;
  const setFrom = isHourly ? st.do.setFromByHourly : st.do.setFromByDaily;
  const setTo = isHourly ? st.do.setToByHourly : st.do.setToByDaily;
  st.tool(`set${capitalize(period)}Period`, {
    settle: false,
    guard: ({ from, to }) => (dayjs(String(to)).isBefore(dayjs(String(from))) ? "The end is before the start." : true),
  })
    .desc(`Set the from and to dates of the ${period} statistics on screen.`)
    .arg("from", Date)
    .arg("to", Date)
    .exec((nextFrom, nextTo) => {
      setFrom(nextFrom);
      setTo(nextTo);
    });

  useEffect(() => {
    void (isHourly ? st.do.getSummaryListInHourly(from, to) : st.do.getSummaryListInDaily(from, to));
  }, [isHourly, from, to]);

  useEffect(() => {
    return () => {
      setFrom(dayjs().subtract(7, "day"));
      setTo(dayjs());
    };
  }, [isHourly]);
  return <Field.DateRange className="h-12" from={from} onChangeFrom={setFrom} to={to} onChangeTo={setTo} />;
};
