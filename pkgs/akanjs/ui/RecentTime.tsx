import { type Dayjs, dayjs } from "akanjs/base";
import { usePage } from "akanjs/client";
import relativeTime from "dayjs/plugin/relativeTime";

import { Tooltip } from "./Tooltip";

dayjs.extend(relativeTime);
export interface RecentTimeProps {
  /** Date value to render. Null renders nothing, and epoch placeholder values render --:--. */
  date: Date | Dayjs | null;
  /** Unit at which relative labels stop and formatted dates are shown instead. */
  breakUnit?: Intl.RelativeTimeFormatUnit;
  /** Use compact automatic formatting or always include date and time. */
  format?: "full" | "auto";
  /** Additional classes for the trigger span. */
  className?: string;
}

export const RecentTime = ({ date, breakUnit, format = "auto", className }: RecentTimeProps) => {
  const { lang } = usePage();
  const now = dayjs();
  const datejs = dayjs(date);
  datejs.locale(lang);
  const diff = dayjs().diff(datejs);
  const dateFormat =
    format === "full"
      ? "YY-MM-DD HH:mm"
      : now.year() !== datejs.year()
        ? "YYYY-MM-DD"
        : now.month() !== datejs.month() || now.date() !== datejs.date()
          ? "MM-DD"
          : "HH:mm";

  const diffSecs = Math.floor(diff / 1000);
  if (!date) return null;
  if (dayjs(0).isSame(date) || dayjs(-1).isSame(date)) return <span>--:--</span>;

  const formatted = datejs.format(dateFormat);
  const relative = datejs.fromNow();
  const diffMins = Math.floor(diff / (1000 * 60));
  const diffHours = Math.floor(diff / (1000 * 3600));
  const diffDays = Math.floor(diff / (1000 * 3600 * 24));
  const diffWeeks = Math.floor(diff / (1000 * 3600 * 24 * 7));
  const diffMonths = Math.floor(diff / (1000 * 3600 * 24 * 30));

  let tip = datejs.format("YYYY-MM-DD HH:mm");
  let label: string;
  if (breakUnit === "second") {
    tip = datejs.format("YYYY-MM-DD HH:mm:ss");
    label = formatted;
  } else if (Math.abs(diffSecs) < 60) label = relative;
  else if (breakUnit === "minute") label = formatted;
  else if (Math.abs(diffMins) < 60) label = relative;
  else if (breakUnit === "hour") label = formatted;
  else if (Math.abs(diffHours) < 24) label = relative;
  else if (breakUnit === "day") label = formatted;
  else if (Math.abs(diffDays) < 7) label = relative;
  else if (breakUnit === "week") label = formatted;
  else if (Math.abs(diffWeeks) < 4) label = relative;
  else if (breakUnit === "month") label = formatted;
  else if (Math.abs(diffMonths) < 12) label = relative;
  else if (breakUnit === "year") label = formatted;
  else label = relative;

  return (
    <Tooltip content={tip}>
      <span className={className}>{label}</span>
    </Tooltip>
  );
};
