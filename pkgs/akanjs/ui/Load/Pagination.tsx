"use client";
import { cn, router } from "akanjs/client";
import { type DynamicRecord, lowerlize } from "akanjs/common";
import type { BaseInsight } from "akanjs/constant";
import type { ClientInit, ServerInit } from "akanjs/fetch";
import { st } from "akanjs/store";
import { usePageTool } from "akanjs/webkit";
import { useRef } from "react";

import { Empty } from "../Empty";
import { Pagination as Pagn } from "../Pagination";
import { sliceNamesOf } from "../sliceNamesOf";
import Stream from "./Stream";

interface PaginationProps<RefName extends string, Light> {
  className?: string;
  init: ClientInit<RefName, Light>;
  scrollToTop?: boolean;
}

interface RenderProps<RefName extends string, Light> {
  className?: string;
  init: ServerInit<RefName, Light>;
  scrollToTop?: boolean;
}
function Render<RefName extends string, Light>({ className, init, scrollToTop }: RenderProps<RefName, Light>) {
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const { refName, sliceName } = init;
  const modelName = lowerlize(refName);
  const initModelInitAt = (init as DynamicRecord)[`${modelName}InitAt`] as Date;
  const loaded = useRef(storeGet<Date>()[`${refName}InitAt`].getTime() >= initModelInitAt.getTime());
  const { names, namesOfSlice } = sliceNamesOf(modelName, sliceName);
  const modelInsight = storeUse[namesOfSlice.modelInsight]() as BaseInsight;
  const limitOfModel = storeUse[namesOfSlice.limitOfModel]() as number;
  const pageOfModel = storeUse[namesOfSlice.pageOfModel]() as number;
  const initModelObjInsight = (init as DynamicRecord)[names.modelObjInsight] as BaseInsight | null;
  const initPageOfModel = (init as DynamicRecord)[names.pageOfModel] as number;
  const initLimitOfModel = (init as DynamicRecord)[names.limitOfModel] as number;
  const insight = loaded.current ? modelInsight : initModelObjInsight;
  const page = loaded.current ? pageOfModel : initPageOfModel;
  const limit = loaded.current ? limitOfModel : initLimitOfModel;
  // Nothing to page through without a count: `{ insight: false }` opted out of the aggregate that provides one.
  const total = insight?.count ?? 0;

  if (!loaded.current) loaded.current = true;
  const selectPage = usePageTool({
    name: total > limit ? namesOfSlice.setPageOfModel : null,
    model: modelName,
    page,
    lastPage: Math.ceil(total / (limit || total || 1)),
    total,
    onSelect: (page) => {
      void storeDo[namesOfSlice.setPageOfModel](page);
      if (!scrollToTop) return;
      router.postPathChange({ page });
      window.scrollTo({ top: 0, behavior: "instant" });
    },
  });

  return (
    <div className={cn("mt-4 flex flex-wrap justify-center", className)}>
      {total > limit ? (
        <Pagn currentPage={page} total={total} itemsPerPage={limit || total} onPageSelect={selectPage} />
      ) : null}
    </div>
  );
}

export default function Pagination<T extends string, L>({ className, init, scrollToTop }: PaginationProps<T, L>) {
  return (
    <Stream of={init} fallback={null}>
      {(serverInit) =>
        serverInit ? <Render className={className} init={serverInit} scrollToTop={scrollToTop} /> : <Empty />
      }
    </Stream>
  );
}
