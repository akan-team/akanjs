"use client";
import { clsx } from "@akanjs/client";
import { FC, ReactNode } from "react";
import { BiChevronLeft, BiChevronRight, BiDotsHorizontalRounded } from "react-icons/bi";

export interface PaginationProps {
  currentPage: number;
  total: number;
  onPageSelect: (page: number) => void;
  itemsPerPage: number;
  renderEmpty?: ReactNode;
  classNames?: {
    className?: string;
    activePageNumClassName?: string;
    pageNumClassName?: string;
  };
}

export const Pagination: FC<PaginationProps> = ({
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
              currentPage > 1 ? "opacity-100" : "opacity-0 hover:cursor-default hover:opacity-0"
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
              currentPage < totalPages ? "opacity-100" : "opacity-0 hover:cursor-default hover:opacity-0"
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
