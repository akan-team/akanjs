"use client";
import { cn } from "akanjs/client";
import type { ReactNode } from "react";
import { BiChevronLeft, BiChevronRight, BiDotsHorizontalRounded } from "react-icons/bi";

import { buttonRecipe } from "./Button";
import { createOverridable, useUiRecipe } from "./UiOverride";

export interface PaginationProps {
  /** 1-based. */
  currentPage: number;
  total: number;
  /** Called with the 1-based page. */
  onPageSelect: (page: number) => void;
  itemsPerPage: number;
  /** Placeholder for a pager with no pages. */
  empty?: ReactNode;
  /** @deprecated Renamed to `empty` — it is a node, not a render function. */
  renderEmpty?: ReactNode;
  /** The mark inside the step-back control; the button itself stays the framework's. */
  prev?: ReactNode;
  next?: ReactNode;
  /** Stands in for the pages a long pager skips. */
  ellipsis?: ReactNode;
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
  empty,
  renderEmpty,
  prev,
  next,
  ellipsis,
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

  const emptyNode = empty ?? renderEmpty;
  if (total <= 0) return emptyNode || null;
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
        {prev ?? <BiChevronLeft />}
      </button>
      {displayNumbers.map((pageNum, index) => {
        if (pageNum === "...")
          return (
            <span className="flex size-9 items-center justify-center text-foreground/30" key={index}>
              {ellipsis ?? <BiDotsHorizontalRounded />}
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
        {next ?? <BiChevronRight />}
      </button>
    </div>
  );
};

export const Pagination = createOverridable("Pagination", DefaultPagination);
