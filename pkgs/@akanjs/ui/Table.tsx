"use client";
import { clsx } from "@akanjs/client";
import type { Responsive } from "@akanjs/constant";
import { st } from "@akanjs/store";
import React, { ReactNode, useMemo } from "react";
import { AiOutlineLoading3Quarters } from "react-icons/ai";

import { Empty } from "./Empty";
import { Pagination, PaginationProps } from "./Pagination";

interface Column {
  key?: string;
  title: ReactNode;
  dataIndex: string;
  render?: (text: any, record: any, idx: number) => React.ReactNode;
  responsive?: Responsive["value"][];
}

interface TableProps {
  columns: Column[];
  dataSource: any[];
  loading?: boolean;
  size?: "small" | "middle";
  bordered?: boolean;
  pagination?: PaginationProps | false;
  showHeader?: boolean | Responsive["value"][];
  onRow?: (record: any, index: number) => { onClick: (() => void) | (() => Promise<boolean>) };
  rowClassName?: string | ((record: any, index: number) => string) | undefined;
  rowKey?: (model: any) => string;
}

export const Table = ({
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
              rowClassName ? (typeof rowClassName === "string" ? rowClassName : rowClassName(rowData, rowIndex)) : ""
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
