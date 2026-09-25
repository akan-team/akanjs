"use client";
import { type Dayjs, dayjs } from "akanjs/base";
import { cn, msg } from "akanjs/client";
import { type ChangeEvent, useEffect } from "react";
import { AiOutlineSwapRight } from "react-icons/ai";

import { inputRecipe } from "./recipe";
import { createOverridable } from "./UiOverride";

type NativeDateType = "date" | "datetime-local" | "time";

// What each native input reads and writes. `datetime-local` carries no zone and no seconds, so its value is the
// wall clock the user sees; `time` carries no day at all. dayjs parses both back as local, matching the field.
const valueFormat = { date: "YYYY-MM-DD", "datetime-local": "YYYY-MM-DDTHH:mm", time: "HH:mm" } as const;

const toInputValue = (value: Dayjs | null | undefined, type: NativeDateType) =>
  value?.isValid() ? value.format(valueFormat[type]) : "";

/** `type="time"` reports a clock reading only, so the day comes from whatever the field already holds. */
const fromInputValue = (raw: string, type: NativeDateType, base: Dayjs) => {
  if (!raw) return null;
  const picked = type === "time" ? dayjs(`${base.format(valueFormat.date)}T${raw}`) : dayjs(raw);
  return picked.isValid() ? picked : null;
};

interface NativeDateInputProps {
  className?: string;
  type: NativeDateType;
  value?: Dayjs | null;
  min?: Dayjs | null;
  max?: Dayjs | null;
  disabled?: boolean;
  disabledDate?: (date: Dayjs) => boolean | null | undefined;
  onChange: (value: Dayjs) => void;
}
const NativeDateInput = ({
  className,
  type,
  value,
  min,
  max,
  disabled,
  disabledDate,
  onChange,
}: NativeDateInputProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = fromInputValue(event.target.value, type, value ?? dayjs());
    if (!picked || disabledDate?.(picked)) {
      msg.warning("base.selectDateError");
      // Put the field back by hand: re-rendering the value it already holds leaves the DOM node alone.
      event.target.value = toInputValue(value, type);
      return;
    }
    onChange(picked);
  };
  return (
    <input
      className={className}
      type={type}
      value={toInputValue(value, type)}
      min={min ? toInputValue(min, type) : undefined}
      max={max ? toInputValue(max, type) : undefined}
      disabled={disabled}
      onChange={handleChange}
    />
  );
};

export interface DatePickerProps {
  className?: string;
  value?: Dayjs | null;
  onChange: (value: Dayjs | null) => void;
  showTime?: boolean;
  /** Earliest selectable value. The browser enforces it. */
  min?: Dayjs | null;
  /** Latest selectable value. The browser enforces it. */
  max?: Dayjs | null;
  /** Rejected on selection rather than greyed out — a native field constrains only through `min` / `max`. */
  disabledDate?: (date: Dayjs) => boolean | null | undefined;
  defaultValue?: Dayjs;
}

const DefaultDatePicker = ({
  className = "",
  value,
  onChange,
  showTime,
  min,
  max,
  disabledDate,
  defaultValue,
}: DatePickerProps) => {
  useEffect(() => {
    if (defaultValue) onChange(defaultValue);
  }, [defaultValue]);

  return (
    <NativeDateInput
      className={inputRecipe({}, ["text-center", className])}
      type={showTime ? "datetime-local" : "date"}
      value={value}
      min={min}
      max={max}
      disabledDate={disabledDate}
      onChange={onChange}
    />
  );
};

export interface RangePickerProps {
  className?: string;
  value: [Dayjs | null, Dayjs | null];
  onChange: (value: [Dayjs | null, Dayjs | null]) => void;
  showTime?: boolean;
  /** Rejected on selection rather than greyed out — a native field constrains only through `min` / `max`. */
  disabledDate?: (date: Dayjs) => boolean | null | undefined;
}

const DefaultRangePicker = ({ className = "", value, onChange, showTime, disabledDate }: RangePickerProps) => {
  const type = showTime ? "datetime-local" : "date";
  // The wrapper is the field shell; the two inputs sit inside it, so they carry no shell of their own —
  // `p-0` on the wrapper puts their edges on top of its border and a second border would double the line.
  const inputClassName = "m-0 h-full w-full border-none bg-transparent p-3 text-center focus:outline-hidden";
  return (
    <div className={inputRecipe({}, ["flex h-full w-fit items-center gap-2 p-0", className])}>
      <NativeDateInput
        className={inputClassName}
        type={type}
        value={value[0]}
        max={value[1]}
        disabledDate={disabledDate}
        onChange={(start) => {
          onChange([start, value[1] ?? dayjs()]);
        }}
      />
      <AiOutlineSwapRight className="text-3xl text-muted-foreground" />
      <NativeDateInput
        className={inputClassName}
        type={type}
        value={value[1]}
        min={value[0]}
        disabledDate={disabledDate}
        onChange={(end) => {
          onChange([value[0] ?? dayjs(), end]);
        }}
      />
    </div>
  );
};

export interface TimePickerProps {
  className?: string;
  value: Dayjs | null;
  onChange: (value: Dayjs) => void;
  disabled?: boolean;
  /** Rejected on selection rather than greyed out — a native field constrains only through `min` / `max`. */
  disabledDate?: (date: Dayjs) => boolean | null | undefined;
}

const DefaultTimePicker = ({ className, value, onChange, disabled, disabledDate }: TimePickerProps) => {
  return (
    <NativeDateInput
      className={cn("inline-block w-auto", className)}
      type="time"
      value={value}
      disabled={disabled}
      disabledDate={disabledDate}
      onChange={onChange}
    />
  );
};

const DatePickerBase = createOverridable("DatePicker", DefaultDatePicker);

/**
 * Date picker. `DatePicker`, `DatePicker.RangePicker`, and `DatePicker.TimePicker` each resolve to a
 * route-scoped override when a `page/**\/_overrides.tsx` in the route's ancestry declares one (slots
 * `DatePicker`, `DatePickerRangePicker`, `DatePickerTimePicker`).
 *
 * Each renders one native `<input type="date" | "datetime-local" | "time">`, so the calendar is the browser's
 * own: an OS wheel on mobile, keyboard entry everywhere, nothing shipped in the bundle. What that costs is a
 * themed popup, a chosen display format, and per-day disabling — an app needing any of those overrides the slot.
 */
export const DatePicker = Object.assign(DatePickerBase, {
  RangePicker: createOverridable("DatePickerRangePicker", DefaultRangePicker),
  TimePicker: createOverridable("DatePickerTimePicker", DefaultTimePicker),
});
