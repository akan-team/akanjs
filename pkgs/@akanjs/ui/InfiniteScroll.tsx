"use client";
import { useEffect, useRef, useState } from "react";
import { BiLoaderAlt } from "react-icons/bi";

export interface InfiniteScrollProps {
  total: number;
  currentPage: number;
  itemsPerPage: number;
  onAddPage: (page: number) => Promise<void>;
  onPageSelect: (page: any) => void;
  children: React.ReactNode;
  reverse?: boolean;
}

export const InfiniteScroll = ({
  itemsPerPage,
  currentPage,
  total,
  onPageSelect,
  onAddPage,
  children,
  reverse,
}: InfiniteScrollProps) => {
  const [isFetching, setIsFetching] = useState(false);
  const target = useRef<HTMLDivElement>(null);
  const page = useRef<number>(currentPage);
  const totalPages = Math.ceil(total / (itemsPerPage || 1));

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting) void fetchMoreItems();
    });
    if (target.current) observer.observe(target.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  // TODO: 여기 작동구조 이상함. 수정 필요
  const fetchMoreItems = async () => {
    if (isFetching) return;
    const nextPage = page.current + 1;
    if (nextPage > totalPages) return;
    setIsFetching(true);
    await onAddPage(nextPage);
    void onAddPage(nextPage);
    onPageSelect(nextPage);
    setIsFetching(false);
    page.current = nextPage;
  };

  return (
    <>
      {reverse ? (
        <div ref={target} className="flex w-full items-end justify-center">
          {isFetching && <BiLoaderAlt className="h-10 animate-spin pb-4 text-2xl" />}
        </div>
      ) : null}
      {children}
      {!reverse ? (
        <div ref={target} className="flex h-32 w-full justify-center pt-4">
          {isFetching && <BiLoaderAlt className="animate-spin text-2xl" />}
        </div>
      ) : null}
    </>
  );
};
