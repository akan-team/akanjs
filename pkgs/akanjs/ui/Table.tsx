"use client";
import { clsx } from "akanjs/client";
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
  const sizeClassName = size === "small" ? "table-compact" : "";
  const loadingClassName = loading ? "opacity-30" : "";
  const borderedClassName = bordered ? "border border-gray-200 rounded-xl" : "";
  const responsive = st.use.responsive();
  const renderedColumns = useMemo(() => {
    return columns
      .filter((c) => !c.responsive || c.responsive.includes(responsive))
      .map((column, idx) => (
        <th key={idx} className="whitespace-nowrap">
          {column.title}
        </th>
      ));
  }, [columns, responsive]);

  const renderedRows = useMemo(() => {
    return dataSource.map((rowData: { [key: string]: any }, rowIndex) => {
      const renderedCells = columns
        .filter((c) => !c.responsive || c.responsive.includes(responsive))
        .map((column, idx) => (
          <td
            key={idx}
            className={clsx(
              "whitespace-nowrap",
              rowClassName ? (typeof rowClassName === "string" ? rowClassName : rowClassName(rowData, rowIndex)) : "",
            )}
            {...onRow?.(rowData, rowIndex)}
          >
            {column.render
              ? column.render(rowData[column.dataIndex], rowData, rowIndex)
              : column.dataIndex
                ? rowData[column.dataIndex]
                : null}
          </td>
        ));

      return <tr key={rowIndex}>{renderedCells}</tr>;
    });
  }, [columns, dataSource, responsive]);

  return (
    <div className={clsx("relative w-full", loadingClassName, borderedClassName)}>
      {loading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <AiOutlineLoading3Quarters className="animate-spin text-3xl" />
        </div>
      )}
      <table className={clsx("table w-full", sizeClassName)}>
        {showHeader === true || (Array.isArray(showHeader) && showHeader.includes(responsive)) ? (
          <thead className="normal-case">
            <tr>{renderedColumns}</tr>
          </thead>
        ) : null}
        {!!dataSource.length && <tbody>{renderedRows}</tbody>}
      </table>
      {!dataSource.length && (
        <div className="w-full">
          <Empty />
        </div>
      )}
      {pagination && (
        <div className="mt-3 flex justify-center">
          <Pagination
            currentPage={pagination.currentPage}
            total={pagination.total}
            onPageSelect={pagination.onPageSelect}
            itemsPerPage={pagination.itemsPerPage}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Data table. Resolves to a route-scoped override when a `page/**\/_overrides.tsx`
 * in the route's ancestry declares one, otherwise renders {@link DefaultTable}.
 */
export const Table = createOverridable("Table", DefaultTable);
