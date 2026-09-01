"use client";
import { cn, usePage } from "akanjs/client";
import type { SliceMeta } from "akanjs/fetch";

import { dictLabel, formatStat } from "./dataText";

interface InsightProps<T extends string, Insight> {
  className?: string;
  insight: Insight;
  slice: SliceMeta;
  columns?: (keyof Insight)[];
}

export default function Insight<T extends string, Insight>({
  className,
  insight,
  slice,
  columns,
}: InsightProps<T, Insight>) {
  const { l } = usePage();
  const { refName } = slice;
  const cells = (columns ?? []).filter((column) => insight[column] !== undefined && insight[column] !== null);
  if (!cells.length) return null;
  return (
    <div className={cn("mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {cells.map((column) => {
        const name = String(column);
        return (
          <div key={name} className="rounded-box border border-border bg-card px-4 py-3">
            <div className="truncate text-muted-foreground text-xs">
              {dictLabel(l._, `${refName}.insight.${name}`, name)}
            </div>
            <div className="mt-1 truncate font-semibold text-foreground text-xl tabular-nums">
              {formatStat(insight[column])}
            </div>
          </div>
        );
      })}
    </div>
  );
}
