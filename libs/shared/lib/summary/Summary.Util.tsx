"use client";
import { st } from "@libs/shared/client";
import { Field } from "@libs/shared/ui";
import { dayjs } from "akanjs/base";
import { useEffect } from "react";

export const HourlyPeriodRange = () => {
  const from = st.use.fromByHourly();
  const to = st.use.toByHourly();
  st.tool("setHourlyPeriod", {
    settle: false,
    guard: ({ from, to }) => (dayjs(String(to)).isBefore(dayjs(String(from))) ? "The end is before the start." : true),
  })
    .desc("Set the from and to dates of the hourly statistics on screen.")
    .arg("from", Date)
    .arg("to", Date)
    .exec((nextFrom, nextTo) => {
      st.do.setFromByHourly(nextFrom);
      st.do.setToByHourly(nextTo);
    });

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
  st.tool("setDailyPeriod", {
    settle: false,
    guard: ({ from, to }) => (dayjs(String(to)).isBefore(dayjs(String(from))) ? "The end is before the start." : true),
  })
    .desc("Set the from and to dates of the daily statistics on screen.")
    .arg("from", Date)
    .arg("to", Date)
    .exec((nextFrom, nextTo) => {
      st.do.setFromByDaily(nextFrom);
      st.do.setToByDaily(nextTo);
    });

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
  st.tool("setMonthlyPeriod", {
    settle: false,
    guard: ({ from, to }) => (dayjs(String(to)).isBefore(dayjs(String(from))) ? "The end is before the start." : true),
  })
    .desc("Set the from and to dates of the monthly statistics on screen.")
    .arg("from", Date)
    .arg("to", Date)
    .exec((nextFrom, nextTo) => {
      st.do.setFromByMonthly(nextFrom);
      st.do.setToByMonthly(nextTo);
    });
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
