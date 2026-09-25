"use client";
import { clsx, usePage } from "akanjs/client";
import type { SliceMeta } from "akanjs/fetch";

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
  return (
    <div className={clsx("stats my-2 flex w-full flex-wrap justify-center py-2 shadow-sm", className)}>
      <div className="stats">
        {columns?.map(
          (column: keyof Insight, idx) =>
            insight[column] !== undefined && (
              <div key={column.toString()} className="stat mx-1 flex items-center rounded-none">
                <div className="stat-title">{l._(`${refName}.insight.${column as string}`)}</div>
                <div className="stat-value text-xl">{(insight[column] as string).toLocaleString()}</div>
              </div>
            ),
        )}
      </div>
    </div>
  );
}
