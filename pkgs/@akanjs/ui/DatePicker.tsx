"use client";
import "react-datepicker/dist/react-datepicker.css";

import { Dayjs, dayjs } from "@akanjs/base";
import { clsx, msg } from "@akanjs/client";
import { lazy } from "@akanjs/next";
import React, { useEffect, useRef } from "react";
import { AiOutlineSwapRight } from "react-icons/ai";

const ReactDatePicker = lazy(() => import("react-datepicker"), { ssr: false });
interface DatePickerProps {
  value?: Dayjs | null;
  onChange: (value: Dayjs | null) => void;
  showTime?: boolean;
  format?: string;
  timeIntervals?: number;
  disabledDate?: (date: Dayjs) => boolean | null | undefined;
  className?: string;
  placement?: "top" | "bottom" | "left" | "right";
  defaultValue?: Dayjs;
}

export const DatePicker = ({
  value,
  onChange,
  showTime,
  format = "yyyy-MM-dd",
  timeIntervals = 10,
  disabledDate,
  placement,
  className = "",
  defaultValue,
}: DatePickerProps) => {
  const clickNum = useRef(0);

  useEffect(() => {
    if (defaultValue) {
      onChange(defaultValue);
    }
  }, [defaultValue]);

  const handleDateChange = (date?: Date | null) => {
    if (!date) {
      msg.warning("base.selectDateError");
      return;
    }
    onChange(dayjs(date));
  };

  return (
    <ReactDatePicker
      className={clsx("input text-center", className)}
      selected={value ? value.toDate() : new Date()}
      disabledKeyboardNavigation
      onFocus={(e) => {
        // 더블클릭 시 수동인풋 할 수 있게
        if (clickNum.current % 2 === 0) e.target.blur();
        clickNum.current++;
      }}
      onChange={handleDateChange}
      showTimeSelect={showTime}
      popperPlacement={placement}
      timeIntervals={timeIntervals}
      filterDate={(date) => (!disabledDate?.(dayjs(date)) ? true : false)}
      dateFormat={format}
    />
  );
};

interface RangePickerProps {
  value: [Dayjs | null, Dayjs | null];
  onChange: (value: [Dayjs | null, Dayjs | null]) => void;
  format?: string;
  showTime?: boolean;
  timeIntervals?: number;
  disabledDate?: (date: Dayjs) => boolean | null | undefined;
  className?: string;
}

const RangePicker = ({
  value,
  onChange,
  format = "yyyy-MM-dd",
  showTime,
  timeIntervals = 10,
  disabledDate,
  className = "",
}: RangePickerProps) => {
  const handleStartDateChange = (date?: Date | null) => {
    if (!date) {
      msg.warning("base.selectDateError");
      return;
    }
    onChange([dayjs(date), value[1] ?? dayjs()]);
  };
  const handleEndDateChange = (date?: Date | null) => {
    if (!date) {
      msg.warning("base.selectDateError");
      return;
    }
    onChange([value[0] ?? dayjs(), dayjs(date)]);
  };

  const pickerClassName = "m-0 input focus:outline-hidden z-50 p-3 text-center h-full w-full ";
  return (
    <div className={clsx("input flex h-full w-fit items-center gap-2 p-0", className)}>
      <ReactDatePicker
        className={pickerClassName}
        selected={value[0] ? value[0].toDate() : undefined}
        selectsStart
        startDate={value[0] ? value[0].toDate() : undefined}
        endDate={value[1] ? value[1].toDate() : undefined}
        onChange={handleStartDateChange}
        showTimeSelect={showTime}
        timeIntervals={timeIntervals}
        filterDate={(date) => (!disabledDate?.(dayjs(date)) ? true : false)}
        dateFormat={format}
      />
      <AiOutlineSwapRight className="text-3xl text-gray-400" />
      <ReactDatePicker
        className={pickerClassName}
        selected={value[1] ? value[1].toDate() : undefined}
        selectsEnd
        startDate={value[0] ? value[0].toDate() : undefined}
        endDate={value[1] ? value[1].toDate() : undefined}
        onChange={handleEndDateChange}
        showTimeSelect={showTime}
        timeIntervals={timeIntervals}
        filterDate={(date: Date) =>
          !disabledDate?.(dayjs(date)) && !!value[0] && !dayjs(date).add(1, "day").isBefore(value[0]) ? true : false
        }
        filterTime={(time: Date) => !!value[0] && dayjs(time).isAfter(value[0])}
        dateFormat={format}
      />
    </div>
  );
};

DatePicker.RangePicker = RangePicker;

interface TimePickerProps {
  value: Dayjs | null;
  onChange: (value: Dayjs) => void;
  format?: string;
  timeIntervals?: number;
  disabledDate?: (date: Dayjs) => boolean | null | undefined;
  className?: string;
  disabled?: boolean;
}

const TimePicker = ({
  disabled,
  className,
  value,
  format = "HH:mm",
  onChange,
  timeIntervals = 10,
}: TimePickerProps) => {
  const handleDateChange = (date?: Date | null) => {
    if (!date) {
      msg.warning("base.selectDateError");
      return;
    }
    onChange(dayjs(date));
  };

  return (
    <ReactDatePicker
      wrapperClassName="inline-block"
      className={clsx("inline-block w-auto", className)}
      selected={value ? value.toDate() : new Date()}
      onChange={handleDateChange}
      showTimeSelect
      showTimeSelectOnly
      timeIntervals={timeIntervals}
      timeCaption="Time"
      dateFormat={format}
      disabled={disabled}
    />
  );
};

DatePicker.TimePicker = TimePicker;

// interface MonthPickerProps {
//   className?: string;
//   yearClassName?: string;
//   monthClassName?: string;
//   value: Dayjs | null;
//   onChange: (value: Dayjs) => void;
//   min?: Dayjs;
//   max?: Dayjs;
//   dateOfMonth?: "first" | "last";
// }

// const MonthPicker = ({
//   className,
//   yearClassName,
//   monthClassName,
//   value,
//   onChange,
//   min = dayjs()
//     .subtract(1, "year")
//     .set("month", 0)
//     .set("date", 1)
//     .set("hour", 0)
//     .set("minute", 0)
//     .set("second", 0)
//     .set("millisecond", 0),
//   max = dayjs()
//     .add(1, "year")
//     .set("month", 11)
//     .set("date", 1)
//     .set("hour", 0)
//     .set("minute", 0)
//     .set("second", 0)
//     .set("millisecond", 0),
//   dateOfMonth = "first",
// }: MonthPickerProps) => {
//   const [year, month] = [value?.year(), value?.month()];
//   const availableYears = Array.from({ length: max.year() - min.year() + 1 }, (_, i) => min.year() + i);
//   const availableMonths = Array.from({ length: 12 }, (_, i) => i)
//     .filter((month) => (year === min.year() ? month >= min.month() : true))
//     .filter((month) => (year === max.year() ? month <= max.month() : true));
//   return (
//     <div className={clsx("flex gap-2", className)}>
//       <Select
//         className={yearClassName}
//         value={year}
//         onChange={(year) => {
//           if (month)
//             onChange(
//               dayjs(value)
//                 .set("year", year)
//                 .set("month", year === max.year() ? max.month() : month)
//                 .set("date", 1)
//                 .set("hour", 0)
//                 .set("minute", 0)
//                 .set("second", 0)
//                 .set("millisecond", 0)
//                 .add(dateOfMonth === "first" ? 0 : 1, "month")
//                 .subtract(dateOfMonth === "first" ? 0 : -1, "millisecond")
//             );
//         }}
//       >
//         {availableYears.map((year, idx) => (
//           <Select.Option key={idx} value={year}>
//             {year}년
//           </Select.Option>
//         ))}
//       </Select>
//       <Select
//         className={monthClassName}
//         value={month}
//         onChange={(month) => {
//           onChange(
//             dayjs(value)
//               .set("month", month)
//               .set("date", 1)
//               .set("hour", 0)
//               .set("minute", 0)
//               .set("second", 0)
//               .set("millisecond", 0)
//               .add(dateOfMonth === "first" ? 0 : 1, "month")
//               .subtract(dateOfMonth === "first" ? 0 : -1, "millisecond")
//           );
//         }}
//       >
//         {availableMonths.map((month, idx) => (
//           <Select.Option key={idx} value={month}>
//             {month + 1}월
//           </Select.Option>
//         ))}
//       </Select>
//     </div>
//   );
// };
// DatePicker.MonthPicker = MonthPicker;
