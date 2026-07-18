"use client";
import { useEffect, useRef, useState } from "react";
import { BiLoaderAlt } from "react-icons/bi";

export interface InfiniteScrollProps {
  total: number;
  currentPage: number;
  itemsPerPage: number;
  onAddPage: (page: number) => Promise<void>;
  onPageSelect: (page: number, option?: { scrollToTop?: boolean }) => void;
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
  const isFetchingRef = useRef(false);
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

  const fetchMoreItems = async () => {
    if (isFetchingRef.current) return;
    const nextPage = page.current + 1;
    if (nextPage > totalPages) return;

    const scroller = reverse ? document.scrollingElement : null;
    const prevScrollHeight = scroller?.scrollHeight ?? 0;
    const prevScrollTop = scroller?.scrollTop ?? 0;

    isFetchingRef.current = true;
    setIsFetching(true);
    try {
      await onAddPage(nextPage);
      onPageSelect(nextPage, { scrollToTop: false });
      page.current = nextPage;

      const restoreScroll = () => {
        if (scroller) {
          scroller.scrollTop = prevScrollTop + (scroller.scrollHeight - prevScrollHeight);
        }
        isFetchingRef.current = false;
        setIsFetching(false);
      };

      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(restoreScroll);
      } else {
        restoreScroll();
      }
    } catch (error) {
      isFetchingRef.current = false;
      setIsFetching(false);
      throw error;
    }
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
