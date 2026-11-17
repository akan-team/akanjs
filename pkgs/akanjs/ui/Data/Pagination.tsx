"use client";
import { cn } from "akanjs/client";
import type { BaseInsight } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { usePageTool } from "akanjs/webkit";

import { Pagination as Pagn } from "../Pagination";
import { sliceNamesOf } from "../sliceNamesOf";

interface PaginationProps<_T extends string> {
  className?: string;
  slice: SliceMeta;
}
export default function Pagination<T extends string>({ className, slice }: PaginationProps<T>) {
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const { refName, sliceName } = slice;
  const { namesOfSlice } = sliceNamesOf(refName, sliceName);
  const modelInsight = storeUse[namesOfSlice.modelInsight]() as BaseInsight;
  const limitOfModel = storeUse[namesOfSlice.limitOfModel]() as number;
  const lastPageOfModel = storeUse[namesOfSlice.lastPageOfModel]() as number;
  const pageOfModel = storeUse[namesOfSlice.pageOfModel]() as number;
  const setPageOfModel = usePageTool({
    name: modelInsight.count > limitOfModel ? namesOfSlice.setPageOfModel : null,
    model: refName,
    page: pageOfModel,
    lastPage: lastPageOfModel,
    total: modelInsight.count,
    onSelect: (page) => void storeDo[namesOfSlice.setPageOfModel](page),
  });
  return (
    <div className={cn("mt-4 flex flex-wrap justify-center", className)}>
      <Pagn
        currentPage={pageOfModel}
        total={modelInsight.count}
        onPageSelect={setPageOfModel}
        itemsPerPage={limitOfModel || modelInsight.count}
      />
    </div>
  );
}
