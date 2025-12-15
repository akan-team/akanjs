"use client";
import { clsx, usePage } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import { st } from "@akanjs/store";

import { Link } from "../Link";

export interface DashboardProps<T extends string, State> {
  className?: string;
  summary: { [key: string]: any };
  sliceName: string;
  queryMap: { [key: string]: any };
  columns?: string[];
  presents?: string[];
  hidePresents?: boolean;
}

export default function Dashboard<T extends string, State>({
  className,
  summary,
  sliceName,
  queryMap,
  columns,
  presents,
  hidePresents,
}: DashboardProps<T, State>) {
  const { l } = usePage();
  const { filter } = st.use.searchParams();
  const refName = (st.slice[sliceName] as unknown as { refName: string }).refName;
  const [modelName, modelClassName] = [refName, capitalize(refName)];
  return (
    <div className={clsx("stats my-2 flex w-full flex-wrap justify-center py-0 shadow-sm", className)}>
      <div className="stats">
        {columns?.map(
          (column) =>
            summary[column] !== undefined &&
            queryMap[column] !== undefined && (
              <button
                key={column}
                className={`btn btn-ghost mx-1 h-32 w-48 rounded-none pt-3 hover:border ${
                  filter === column ? "border" : "border-0"
                }`}
              >
                <Link key={column} className="stat" href={`/admin?topMenu=data&subMenu=${modelName}&filter=${column}`}>
                  <div className="stat-title">{l(`summary.${column}` as "base.new")}</div>
                  <div className="stat-value text-primary">{(summary[column] as string).toLocaleString()}</div>
                </Link>
              </button>
            )
        )}
        {!hidePresents
          ? presents?.map(
              (column) =>
                summary[column] !== undefined &&
                queryMap[column] !== undefined && (
                  <button key={column} className={`btn btn-ghost mx-1 h-32 w-48 rounded-none border-none pt-3`}>
                    <div className="stat">
                      <div className="stat-title">{l(`summary.${column}` as "base.new")}</div>
                      <div className="stat-value text-primary">{summary[column]}</div>
                    </div>
                  </button>
                )
            )
          : null}
      </div>
    </div>
  );
}
