"use client";
import { dayjs } from "@akanjs/base";
import { st } from "@shared/client";
import { Field } from "@shared/ui";
import { useEffect } from "react";

export const HourlyPeriodRange = () => {
  const from = st.use.fromByHourly();
  const to = st.use.toByHourly();

  useEffect(() => {
    void st.do.getSummaryListInHourly(from, to);
  }, [from, to]);

  useEffect(() => {
    void st.do.getSummaryListInHourly(from, to);
    return () => {
      st.do.setFromByHourly(dayjs().subtract(7, "day"));
      st.do.setToByHourly(dayjs());
    };
  }, []);
  return (
    <Field.DateRange
      className="h-12"
      from={from}
      onChangeFrom={st.do.setFromByHourly}
      to={to}
      onChangeTo={st.do.setToByHourly}
    />
  );
};

export const DailyPeriodRange = () => {
  const from = st.use.fromByDaily();
  const to = st.use.toByDaily();

  useEffect(() => {
    void st.do.getSummaryListInDaily(from, to);
  }, [from, to]);

  useEffect(() => {
    void st.do.getSummaryListInDaily(from, to);
    return () => {
      st.do.setFromByDaily(dayjs().subtract(7, "day"));
      st.do.setToByDaily(dayjs());
    };
  }, []);
  return (
    <Field.DateRange
      className="h-12"
      from={from}
      onChangeFrom={st.do.setFromByDaily}
      to={to}
      onChangeTo={st.do.setToByDaily}
    />
  );
};

export const MonthlyPeriodRange = () => {
  const from = st.use.fromByMonthly();
  const to = st.use.toByMonthly();
  useEffect(() => {
    void st.do.getSummaryListInMonthly(from, to);
  }, [from, to]);

  useEffect(() => {
    void st.do.getSummaryListInMonthly(from, to);
    return () => {
      st.do.setFromByMonthly(dayjs().subtract(6, "month"));
      st.do.setToByMonthly(dayjs());
    };
  }, []);
  return (
    <div className="flex items-center justify-between gap-5">
      {/* <Field.DateDropdown
        value={from}
        onChange={(e) => {
          st.do.setFromByMonthly(dayjs(e));
        }}
      />
      &nbsp;~&nbsp;
      <Field.DateDropdown
        value={to}
        onChange={(e) => {
          st.do.setToByMonthly(dayjs(e));
        }}
      /> */}
    </div>
  );
};
