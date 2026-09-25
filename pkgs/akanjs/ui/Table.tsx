"use client";
import { cn } from "akanjs/client";
import type { Responsive } from "akanjs/constant";
import { st } from "akanjs/store";
import type React from "react";
import { type ReactNode, useMemo } from "react";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

import { Empty } from "./Empty";
import { Pagination, type PaginationProps } from "./Pagination";
import { createOverridable } from "./UiOverride";

export interface Column {
  /** Stable column key. Defaults to index when omitted. */
  key?: string;
  /** Header label. */
  title: ReactNode;
  /** Field name read from each row object. */
  dataIndex: string;
  /** Custom cell renderer. */
  render?: (text: any, record: any, idx: number) => React.ReactNode;
  /** Responsive breakpoints where this column should be visible. */
  responsive?: Responsive["value"][];
}

export interface TableProps {
  /** Column definitions. */
  columns: Column[];
  /** Rows rendered by the table. */
  dataSource: any[];
  /** Show a centered loading spinner and dim rows. */
  loading?: boolean;
  /** Table density. */
  size?: "small" | "middle";
  /** Add a border around the table wrapper. */
  bordered?: boolean;
  /** Pagination config, or false to hide pagination. */
  pagination?: PaginationProps | false;
  /** Show header always, never, or only at selected responsive breakpoints. */
  showHeader?: boolean | Responsive["value"][];
  /** Row event factory. */
  onRow?: (record: any, index: number) => { onClick: (() => void) | (() => Promise<boolean>) };
  /** Row class or class factory. */
  rowClassName?: string | ((record: any, index: number) => string) | undefined;
  /** Custom row key resolver. */
  rowKey?: (model: any) => string;
}

export const DefaultTable = ({
  columns,
  dataSource,
  loading,
  size,
  bordered,
  pagination,
  showHeader = true,
  onRow,
  rowClassName,
  rowKey,
}: TableProps) => {
  const responsive = st.use.responsive({ agent: false });
  const visible = useMemo(
    () => columns.filter((column) => !column.responsive || column.responsive.includes(responsive)),
    [columns, responsive],
  );
  const withHeader = showHeader === true || (Array.isArray(showHeader) && showHeader.includes(responsive));

  return (
    <div className="w-full">
      <div className="relative">
        <div
          className={cn(
            "scrollbar-thin w-full overflow-x-auto",
            bordered && "rounded-box border border-border",
            loading && "opacity-30",
          )}
        >
          <table
            className={cn("w-full border-collapse text-left text-sm", size === "small" && "[&_td]:py-1 [&_th]:py-1")}
          >
            {withHeader ? (
              <thead className="bg-muted/40">
                <tr className="border-border border-b">
                  {visible.map((column, idx) => (
                    <th
                      key={column.key ?? idx}
                      className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground"
                    >
                      {column.title}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            {dataSource.length ? (
              <tbody>
                {dataSource.map((rowData: { [key: string]: any }, rowIndex) => (
                  <tr
                    key={rowKey?.(rowData) ?? rowIndex}
                    className={cn(
                      "border-border border-b transition-colors last:border-b-0 hover:bg-muted/40",
                      onRow && "cursor-pointer",
                      typeof rowClassName === "string" ? rowClassName : rowClassName?.(rowData, rowIndex),
                    )}
                    {...onRow?.(rowData, rowIndex)}
                  >
                    {visible.map((column, idx) => (
                      <td key={column.key ?? idx} className="whitespace-nowrap px-3 py-2 align-middle">
                        {column.render
                          ? column.render(rowData[column.dataIndex], rowData, rowIndex)
                          : column.dataIndex
                            ? rowData[column.dataIndex]
                            : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : null}
          </table>
          {dataSource.length ? null : <Empty minHeight={160} />}
        </div>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <AiOutlineLoading3Quarters className="animate-spin text-3xl text-primary/70" />
          </div>
        ) : null}
      </div>
      {pagination ? (
        <div className="mt-3 flex justify-center">
          <Pagination
            currentPage={pagination.currentPage}
            total={pagination.total}
            onPageSelect={pagination.onPageSelect}
            itemsPerPage={pagination.itemsPerPage}
          />
        </div>
      ) : null}
    </div>
  );
};

/**
 * Data table. Resolves to a route-scoped override when a `page/**\/_overrides.tsx`
 * in the route's ancestry declares one, otherwise renders {@link DefaultTable}.
 */
export const Table = createOverridable("Table", DefaultTable);
