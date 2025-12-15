"use client";
import { clsx } from "@akanjs/client";
import dynamic from "next/dynamic";
import { isMobile } from "react-device-detect";

import { Pagination } from "./Pagination";

const InfiniteScroll = dynamic(() => import("./InfiniteScroll").then((mod) => mod.InfiniteScroll), { ssr: false });

interface MoreProps {
  total: number;
  itemsPerPage: number;
  currentPage: number;
  onAddPage: (page: any) => Promise<void>;
  onPageSelect: (page: any) => void;
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
