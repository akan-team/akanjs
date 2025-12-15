import { Dayjs, dayjs } from "@akanjs/base";
import { clsx, usePage } from "@akanjs/client";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export const RecentTime = ({
  date,
  breakUnit,
  format = "auto",
  className,
}: {
  date: Date | Dayjs | null;
  breakUnit?: Intl.RelativeTimeFormatUnit;
  format?: "full" | "auto";
  className?: string;
}) => {
  const { lang } = usePage();
  const now = dayjs();
  const datejs = dayjs(date).locale(lang);
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
  if (breakUnit === "second")
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm:ss")}>
        {datejs.format(dateFormat)}
      </span>
    );
  if (Math.abs(diffSecs) < 60)
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.fromNow()}
      </span>
    );
  else if (breakUnit === "minute")
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.format(dateFormat)}
      </span>
    );
  const diffMins = Math.floor(diff / (1000 * 60));
  if (Math.abs(diffMins) < 60)
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.fromNow()}
      </span>
    );
  else if (breakUnit === "hour")
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.format(dateFormat)}
      </span>
    );
  const diffHours = Math.floor(diff / (1000 * 3600));
  if (Math.abs(diffHours) < 24)
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.fromNow()}
      </span>
    );
  else if (breakUnit === "day")
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.format(dateFormat)}
      </span>
    );
  const diffDays = Math.floor(diff / (1000 * 3600 * 24));
  if (Math.abs(diffDays) < 7)
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.fromNow()}
      </span>
    );
  else if (breakUnit === "week")
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.format(dateFormat)}
      </span>
    );
  const diffWeeks = Math.floor(diff / (1000 * 3600 * 24 * 7));
  if (Math.abs(diffWeeks) < 4)
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.fromNow()}
      </span>
    );
  else if (breakUnit === "month")
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.format(dateFormat)}
      </span>
    );
  const diffMonths = Math.floor(diff / (1000 * 3600 * 24 * 30));
  if (Math.abs(diffMonths) < 12)
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.fromNow()}
      </span>
    );
  else if (breakUnit === "year")
    return (
      <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
        {datejs.format(dateFormat)}
      </span>
    );
  return (
    <span className={clsx("tooltip", className)} data-tip={datejs.format("YYYY-MM-DD HH:mm")}>
      {datejs.fromNow()}
    </span>
  );
};
