"use client";
import { BaseInsight } from "@akanjs/base";
import { clsx } from "@akanjs/client";
import { capitalize, lowerlize } from "@akanjs/common";
import { useFetch } from "@akanjs/next";
import { ClientInit, ServerInit } from "@akanjs/signal";
import { st } from "@akanjs/store";
import { type Usable, use, useRef } from "react";

import { Empty } from "../Empty";
import { Pagination as Pagn } from "../Pagination";

interface PaginationProps<T extends string, L> {
  className?: string;
  init: ClientInit<T, L>;
  scrollToTop?: boolean;
}

interface RenderProps<T extends string, L> {
  className?: string;
  init: ServerInit<T, L>;
  scrollToTop?: boolean;
}
function Render<T extends string, L>({ className, init, scrollToTop }: RenderProps<T, L>) {
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const modelInit = (init as Promise<any> | { then?: any }).then
    ? use(init as unknown as Usable<ServerInit<T, L>>)
    : init;
  const { refName, sliceName } = modelInit;
  const [modelName, ModelName] = [lowerlize(refName), capitalize(refName)];
  const initModelInitAt = modelInit[`${modelName}InitAt`] as Date;
  const loaded = useRef(storeGet<Date>()[`${modelInit.refName}InitAt`].getTime() >= initModelInitAt.getTime());
  const names = {
    model: modelName,
    modelInsight: `${modelName}Insight`,
    modelInitAt: `${modelName}InitAt`,
    modelObjInsight: `${modelName}ObjInsight`,
    pageOfModel: `pageOf${ModelName}`,
    lastPageOfModel: `lastPageOf${ModelName}`,
    limitOfModel: `limitOf${ModelName}`,
    setPageOfModel: `setPageOf${ModelName}`,
    addPageOfModel: `addPageOf${ModelName}`,
  };
  const namesOfSlice = {
    modelInsight: sliceName.replace(names.model, names.modelInsight),
    limitOfModel: sliceName.replace(names.model, names.limitOfModel),
    lastPageOfModel: sliceName.replace(names.model, names.lastPageOfModel),
    pageOfModel: sliceName.replace(names.model, names.pageOfModel),
    setPageOfModel: sliceName.replace(names.model, names.setPageOfModel),
    addPageOfModel: sliceName.replace(names.model, names.addPageOfModel),
  };
  const modelInsight = storeUse[namesOfSlice.modelInsight]() as BaseInsight;
  const limitOfModel = storeUse[namesOfSlice.limitOfModel]() as number;
  const pageOfModel = storeUse[namesOfSlice.pageOfModel]() as number;
  const initModelObjInsight = modelInit[names.modelObjInsight] as BaseInsight;
  const initPageOfModel = modelInit[names.pageOfModel] as number;
  const initLimitOfModel = modelInit[names.limitOfModel] as number;
  const insight = loaded.current ? modelInsight : initModelObjInsight;
  const page = loaded.current ? pageOfModel : initPageOfModel;
  const limit = loaded.current ? limitOfModel : initLimitOfModel;

  if (!loaded.current) loaded.current = true;

  return (
    <div className={clsx("mt-4 flex flex-wrap justify-center", className)}>
      {insight.count > limit && (
        <Pagn
          currentPage={page}
          total={insight.count}
          itemsPerPage={limit || insight.count}
          onPageSelect={(page) => {
            void storeDo[namesOfSlice.setPageOfModel](page);
            if (scrollToTop) {
              window.parent.postMessage({ type: "pathChange", page }, "*");
              window.scrollTo({ top: 0, behavior: "instant" });
            }
          }}
        />
      )}
    </div>
  );
}

export default function Pagination<T extends string, L>({ className, init, scrollToTop }: PaginationProps<T, L>) {
  const { fulfilled, value: promiseInit } = useFetch(init);
  return fulfilled ? promiseInit ? <Render scrollToTop init={promiseInit} /> : <Empty /> : <></>;
}
