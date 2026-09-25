"use client";
import { cn, usePage } from "akanjs/client";
import { fieldQueryMetaOf } from "akanjs/constant";
import type { QuerySetting, SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { useState } from "react";

import { dictLabel, formatStat } from "./dataText";

export interface DashboardProps<T extends string, State> {
  className?: string;
  summary: Record<string, unknown>;
  /** The listing these tiles belong to. Kept so a caller names its target; the labels are app-level keys. */
  slice: SliceMeta;
  /**
   * Overrides the filter a column applies. A column left out still narrows the listing when its own field
   * declares a query with `.meta(...)`; one with neither renders as a plain tile.
   */
  queryMap?: { [column: string]: QuerySetting };
  /** Model whose fields the columns name. Its `.meta(...)` declarations are where a tile's filter comes from. */
  summaryRefName?: string;
  /** Applies one column's filter. Without it a mapped column still renders, but as a plain tile. */
  onSelect?: (setting: QuerySetting, column: string) => void;
  /** The filter key the listing is showing, so a tile stops looking active once the toolbar moves off it. */
  queryKey?: string;
  columns?: string[];
  presents?: string[];
  hidePresents?: boolean;
}

const tileClassName = "flex min-w-40 flex-1 flex-col gap-1 rounded-box border px-4 py-3 text-left";

export default function Dashboard<T extends string, State>({
  className,
  summary,
  slice,
  queryMap,
  summaryRefName = "summary",
  onSelect,
  queryKey,
  columns,
  presents,
  hidePresents,
}: DashboardProps<T, State>) {
  const { l } = usePage();
  const searchParams = st.use.searchParams({ agent: false });
  const filter = Array.isArray(searchParams.filter) ? searchParams.filter[0] : searchParams.filter;
  // Seeded from `?filter=`, which is how a link from elsewhere opens this listing already narrowed. A click
  // moves it from here on, because applying the filter in place is one request and a navigation is a reload.
  const [selected, setSelected] = useState(typeof filter === "string" ? filter : undefined);
  // The tile's filter: the caller's explicit map first, then the column's own field, because a counter already
  // knows which listing it counts and the page should not have to restate it. A meta naming another model counts
  // rows of another listing, and applying it to this one would filter the wrong thing.
  const settingOf = (column: string): QuerySetting | undefined => {
    // A mapped column whose key is empty named no filter, so it falls through rather than applying nothing.
    if (queryMap?.[column]?.queryKey) return queryMap[column];
    const meta = fieldQueryMetaOf(summaryRefName, column);
    if (!meta?.queryKey || meta.refName !== slice.refName) return undefined;
    return { queryKey: meta.queryKey, args: meta.queryArgs };
  };
  const shownColumns = (columns ?? []).filter((column) => summary[column] !== undefined);
  const shownPresents = hidePresents ? [] : (presents ?? []).filter((column) => summary[column] !== undefined);
  if (!shownColumns.length && !shownPresents.length) return null;
  const activeColumn = selected && settingOf(selected)?.queryKey === queryKey ? selected : undefined;
  return (
    <div className={cn("mb-4 flex flex-wrap gap-2", className)}>
      {[...shownColumns, ...shownPresents].map((column) => {
        const setting = settingOf(column);
        const label = dictLabel(l._, `summary.${column}`, column);
        const body = (
          <>
            <span className="truncate text-muted-foreground text-xs">{label}</span>
            <span className="truncate font-semibold text-2xl text-primary tabular-nums">
              {formatStat(summary[column])}
            </span>
          </>
        );
        return setting && onSelect ? (
          <button
            className={cn(
              tileClassName,
              "bg-card transition hover:border-primary/50",
              activeColumn === column ? "border-primary" : "border-border",
            )}
            key={column}
            onClick={() => {
              setSelected(column);
              onSelect(setting, column);
            }}
            type="button"
          >
            {body}
          </button>
        ) : (
          <div className={cn(tileClassName, "border-border bg-card")} key={column}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
