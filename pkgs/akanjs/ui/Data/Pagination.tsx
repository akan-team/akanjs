"use client";
import { clsx } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { BaseInsight } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";

import { Pagination as Pagn } from "../Pagination";

interface PaginationProps<T extends string> {
  /** Additional classes for the pagination wrapper. */
  className?: string;
  /** Generated slice metadata used to read page state and dispatch page changes. */
  slice: SliceMeta;
}
export default function Pagination<T extends string>({ className, slice }: PaginationProps<T>) {
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const { refName, sliceName } = slice;
  const [modelName, modelClassName] = [refName, capitalize(refName)];
  const names = {
    model: modelName,
    modelInsight: `${modelName}Insight`,
    limitOfModel: `limitOf${modelClassName}`,
    lastPageOfModel: `lastPageOf${modelClassName}`,
    pageOfModel: `pageOf${modelClassName}`,
    setPageOfModel: `setPageOf${modelClassName}`,
  };
  const namesOfSlice = {
    modelInsight: sliceName.replace(names.model, names.modelInsight),
    limitOfModel: sliceName.replace(names.model, names.limitOfModel),
    lastPageOfModel: sliceName.replace(names.model, names.lastPageOfModel),
    pageOfModel: sliceName.replace(names.model, names.pageOfModel),
    setPageOfModel: sliceName.replace(names.model, names.setPageOfModel),
  };
  const modelInsight = storeUse[namesOfSlice.modelInsight]() as BaseInsight;
  const limitOfModel = storeUse[namesOfSlice.limitOfModel]() as number;
  const lastPageOfModel = storeUse[namesOfSlice.lastPageOfModel]() as number;
  const pageOfModel = storeUse[namesOfSlice.pageOfModel]() as number;
  return (
    <div className={clsx("mt-4 flex flex-wrap justify-center", className)}>
      <Pagn
        currentPage={pageOfModel}
        // showQuickJumper={lastPageOfModel > 10}
        total={modelInsight.count}
        onPageSelect={(page) => {
          void storeDo[namesOfSlice.setPageOfModel](page);
        }}
        itemsPerPage={limitOfModel || modelInsight.count}
      />
    </div>
  );
}
