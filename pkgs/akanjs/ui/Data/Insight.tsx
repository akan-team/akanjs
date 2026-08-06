"use client";
import { cn, usePage } from "akanjs/client";
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
    <div className={cn("my-2 flex w-full flex-wrap justify-center py-2 shadow-sm", className)}>
      <div className="flex flex-wrap">
        {columns?.map(
          (column: keyof Insight, idx) =>
            insight[column] !== undefined && (
              <div key={column.toString()} className="mx-1 flex items-center gap-2 rounded-none px-6 py-4">
                <div className="text-foreground/60 text-xs">{l._(`${refName}.insight.${column as string}`)}</div>
                <div className="font-semibold text-xl">{(insight[column] as string).toLocaleString()}</div>
              </div>
            ),
        )}
      </div>
    </div>
  );
}
