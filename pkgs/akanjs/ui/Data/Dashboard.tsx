"use client";
import { cn, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";

import { buttonRecipe } from "../Button";
import { Link } from "../Link";

export interface DashboardProps<T extends string, State> {
  className?: string;
  summary: Record<string, unknown>;
  slice: SliceMeta;
  queryMap: Record<string, unknown>;
  columns?: string[];
  presents?: string[];
  hidePresents?: boolean;
}

export default function Dashboard<T extends string, State>({
  className,
  summary,
  slice,
  queryMap,
  columns,
  presents,
  hidePresents,
}: DashboardProps<T, State>) {
  const { refName, sliceName } = slice;
  const { l } = usePage();
  const searchParams = st.use.searchParams();
  const filter = Array.isArray(searchParams.filter) ? searchParams.filter[0] : searchParams.filter;
  const [modelName, modelClassName] = [refName, capitalize(refName)];
  const formatSummaryValue = (value: unknown) =>
    typeof value === "number" || typeof value === "string" ? value.toLocaleString() : "";
  return (
    <div className={cn("my-2 flex w-full flex-wrap justify-center py-0 shadow-sm", className)}>
      <div className="flex flex-wrap">
        {columns?.map(
          (column) =>
            summary[column] !== undefined &&
            queryMap[column] !== undefined && (
              <button
                key={column}
                className={buttonRecipe({ variant: "ghost" }, [
                  "mx-1 h-32 w-48 rounded-none pt-3 hover:border",
                  filter === column ? "border" : "border-0",
                ])}
              >
                <Link
                  key={column}
                  className="flex flex-col gap-1"
                  href={`/admin?topMenu=data&subMenu=${modelName}&filter=${column}`}
                >
                  <div className="text-foreground/60 text-xs">{l(`summary.${column}` as "base.new")}</div>
                  <div className="font-semibold text-2xl text-primary">{formatSummaryValue(summary[column])}</div>
                </Link>
              </button>
            ),
        )}
        {!hidePresents
          ? presents?.map(
              (column) =>
                summary[column] !== undefined &&
                queryMap[column] !== undefined && (
                  <button
                    key={column}
                    className={buttonRecipe({ variant: "ghost" }, "mx-1 h-32 w-48 rounded-none border-none pt-3")}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="text-foreground/60 text-xs">{l(`summary.${column}` as "base.new")}</div>
                      <div className="font-semibold text-2xl text-primary">{formatSummaryValue(summary[column])}</div>
                    </div>
                  </button>
                ),
            )
          : null}
      </div>
    </div>
  );
}
