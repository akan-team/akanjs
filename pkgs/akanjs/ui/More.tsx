"use client";
import { clsx, isMobileDevice } from "akanjs/client";
import { useEffect, useState } from "react";
import { InfiniteScroll } from "./InfiniteScroll";
import { Pagination } from "./Pagination";

interface MoreProps {
  total: number;
  itemsPerPage: number;
  currentPage: number;
  onAddPage: (page: number) => Promise<void>;
  onPageSelect: (page: number, option?: { scrollToTop?: boolean }) => void;
  children?: React.ReactNode;
  className?: string;
  reverse?: boolean;
}

export const More = ({
  total,
  itemsPerPage,
  currentPage,
  onAddPage,
  onPageSelect,
  children,
  className,
  reverse,
}: MoreProps) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  if (total <= itemsPerPage) {
    return <>{children}</>;
  }

  if (isMobile) {
    return (
      <InfiniteScroll
        total={total}
        currentPage={currentPage}
        itemsPerPage={itemsPerPage}
        onAddPage={onAddPage}
        onPageSelect={onPageSelect}
        reverse={reverse}
      >
        {children}
      </InfiniteScroll>
    );
  }
  return (
    <>
      {children}
      <div className={clsx("mt-4 flex w-full flex-wrap justify-center", className)}>
        <Pagination currentPage={currentPage} total={total} itemsPerPage={itemsPerPage} onPageSelect={onPageSelect} />
      </div>
    </>
  );
};
