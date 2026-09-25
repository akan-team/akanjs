"use client";
import { clsx } from "akanjs/client";
import type { FC, ReactNode } from "react";
import { BiChevronLeft, BiChevronRight, BiDotsHorizontalRounded } from "react-icons/bi";

import { createOverridable } from "./UiOverride";

export interface PaginationProps {
  /** Current 1-based page number. */
  currentPage: number;
  /** Total number of items. */
  total: number;
  /** Called with the selected 1-based page number. */
  onPageSelect: (page: number) => void;
  /** Number of items per page. Used to calculate total pages. */
  itemsPerPage: number;
  /** Optional custom content when there is no data. */
  renderEmpty?: ReactNode;
  /** Class overrides for wrapper and page buttons. */
  classNames?: {
    className?: string;
    activePageNumClassName?: string;
    pageNumClassName?: string;
  };
}

export const DefaultPagination: FC<PaginationProps> = ({
  currentPage,
  total,
  onPageSelect,
  itemsPerPage,
  renderEmpty,
  classNames,
}) => {
  const totalPages = Math.ceil(total / (itemsPerPage || 1));
  const handleLeftClick = () => {
    if (currentPage <= 1) return;
    onPageSelect(currentPage - 1);
  };
  const handleRightClick = () => {
    if (currentPage >= totalPages) return;
    onPageSelect(currentPage + 1);
  };
  const pageNumbers = new Array(totalPages).fill("").map((_, i) => {
    return String(i + 1);
  });
  let displayNumbers = pageNumbers;
  if (totalPages > 10) {
    if (currentPage < 5) {
      displayNumbers = pageNumbers.slice(0, 5).concat(["...", String(totalPages)]);
    } else if (currentPage >= 5 && currentPage <= totalPages - 4) {
      displayNumbers = [
        "1",
        "...",
        ...pageNumbers.slice(Number(currentPage) - 3, Number(currentPage) + 2),
        "...",
        String(totalPages),
      ];
    } else {
      displayNumbers = ["1", "...", ...pageNumbers.slice(-5)];
    }
  }

  return (
    <div className="flex items-center justify-center">
      {total > 0 && (
        <>
          <button
            className={clsx(
              "btn btn-ghost btn-square duration-200",
              currentPage > 1 ? "opacity-100" : "opacity-0 hover:cursor-default hover:opacity-0",
            )}
            onClick={handleLeftClick}
          >
            <BiChevronLeft />
          </button>

          {displayNumbers.map((pageNum, index) => {
            if (pageNum === "...") {
              return (
                <button key={index} className="btn btn-ghost btn-square text-primary/40">
                  <BiDotsHorizontalRounded />
                </button>
              );
            }
            if (Number(pageNum) === currentPage) {
              return (
                <button
                  key={index}
                  className={clsx("btn btn-ghost btn-square text-primary", classNames?.activePageNumClassName)}
                >
                  {pageNum}
                </button>
              );
            }
            return (
              <button
                key={index}
                className={clsx("btn btn-ghost btn-square text-primary/40", classNames?.pageNumClassName)}
                onClick={() => {
                  onPageSelect(Number(pageNum));
                }}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            className={clsx(
              "btn btn-ghost btn-square duration-200",
              currentPage < totalPages ? "opacity-100" : "opacity-0 hover:cursor-default hover:opacity-0",
            )}
            onClick={handleRightClick}
          >
            <BiChevronRight />
          </button>
        </>
      )}
    </div>
  );
};

/**
 * Pager. Resolves to a route-scoped override when a `page/**\/_overrides.tsx` in
 * the route's ancestry declares one, otherwise renders {@link DefaultPagination}.
 */
export const Pagination = createOverridable("Pagination", DefaultPagination);
