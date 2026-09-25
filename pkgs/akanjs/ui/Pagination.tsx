"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { BiChevronLeft, BiChevronRight, BiDotsHorizontalRounded } from "react-icons/bi";

import { buttonRecipe } from "./Button";
import { createOverridable, useUiRecipe } from "./UiOverride";

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

export const DefaultPagination = ({
  currentPage,
  total,
  onPageSelect,
  itemsPerPage,
  renderEmpty,
  classNames,
}: PaginationProps) => {
  const recipe = useUiRecipe("button") ?? buttonRecipe;
  const totalPages = Math.ceil(total / (itemsPerPage || 1));
  const pageNumbers = new Array(totalPages).fill("").map((_, i) => String(i + 1));
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

  if (total <= 0) return renderEmpty ? <>{renderEmpty}</> : null;
  return (
    <div className={cn("flex items-center justify-center gap-1", classNames?.className)}>
      <button
        aria-label="Previous page"
        className={recipe({ variant: "ghost", size: "icon" })}
        disabled={currentPage <= 1}
        onClick={() => {
          onPageSelect(currentPage - 1);
        }}
        type="button"
      >
        <BiChevronLeft />
      </button>
      {displayNumbers.map((pageNum, index) => {
        if (pageNum === "...")
          return (
            <span className="flex size-9 items-center justify-center text-foreground/30" key={index}>
              <BiDotsHorizontalRounded />
            </span>
          );
        const isCurrent = Number(pageNum) === currentPage;
        return (
          <button
            aria-current={isCurrent ? "page" : undefined}
            className={
              isCurrent
                ? recipe({ variant: "primary", size: "icon" }, classNames?.activePageNumClassName)
                : recipe({ variant: "ghost", size: "icon" }, ["text-foreground/60", classNames?.pageNumClassName])
            }
            key={index}
            onClick={() => {
              onPageSelect(Number(pageNum));
            }}
            type="button"
          >
            {pageNum}
          </button>
        );
      })}
      <button
        aria-label="Next page"
        className={recipe({ variant: "ghost", size: "icon" })}
        disabled={currentPage >= totalPages}
        onClick={() => {
          onPageSelect(currentPage + 1);
        }}
        type="button"
      >
        <BiChevronRight />
      </button>
    </div>
  );
};

/**
 * Pager. Resolves to a route-scoped override when a `page/**\/_overrides.tsx` in
 * the route's ancestry declares one, otherwise renders {@link DefaultPagination}.
 */
export const Pagination = createOverridable("Pagination", DefaultPagination);
