"use client";
import { BaseInsight, DataList } from "@akanjs/base";
import { clsx } from "@akanjs/client";
import { capitalize, isQueryEqual, lowerlize } from "@akanjs/common";
import { constantInfo } from "@akanjs/constant";
import { useFetch } from "@akanjs/next";
import { ClientInit, ServerInit } from "@akanjs/signal";
import { st } from "@akanjs/store";
import { ReactNode, RefObject, useEffect, useMemo, useRef } from "react";

import { Empty } from "../Empty";
import { Loading } from "../Loading";
import { More } from "../More";

interface DefaultProps<L extends { id: string }> {
  containerRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  style?: React.CSSProperties;
  noDiv?: boolean;
  from?: number;
  to?: number;
  loading?: ReactNode;
  filter?: (item: L, idx: number) => boolean;
  sort?: (a: L, b: L) => number;
  renderEmpty?: null | (() => ReactNode);
  renderItem?: (item: L, idx: number) => ReactNode;
  renderList?: (list: DataList<L>) => ReactNode;
  reverse?: boolean;
  pagination?: boolean;
}

interface UnitsProps<T extends string, M extends { id: string }, L extends { id: string }> extends DefaultProps<L> {
  init: ClientInit<T, L>;
}

interface RenderProps<T extends string, M extends { id: string }, L extends { id: string }> extends DefaultProps<L> {
  init: ServerInit<T, L>;
}

function Render<T extends string, M extends { id: string }, L extends { id: string }>({
  containerRef,
  className,
  style,
  init,
  noDiv,
  from,
  to,
  loading,
  renderItem,
  renderList,
  renderEmpty = noDiv
    ? () => null
    : () => (
        <div className="flex size-full items-center justify-center">
          <Empty />
        </div>
      ),
  filter = () => true,
  sort = (a, b) => 1,
  reverse,
  pagination,
}: RenderProps<T, M, L>) {
  const loaded = useRef(false);
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const { refName, sliceName } = init;
  const [modelName, ModelName] = [lowerlize(refName), capitalize(refName)];
  const cnst = constantInfo.getDatabase(refName);
  const names = {
    model: modelName,
    modelList: `${modelName}List`,
    modelListLoading: `${modelName}ListLoading`,
    modelInsight: `${modelName}Insight`,
    modelInitList: `${modelName}InitList`,
    modelInitAt: `${modelName}InitAt`,
    modelObjList: `${modelName}ObjList`,
    modelObjInsight: `${modelName}ObjInsight`,
    lightCrystalizeModel: `lightCrystalize${ModelName}`,
    crystalizeModelInsight: `crystalize${ModelName}Insight`,
    pageOfModel: `pageOf${ModelName}`,
    lastPageOfModel: `lastPageOf${ModelName}`,
    limitOfModel: `limitOf${ModelName}`,
    queryArgsOfModel: `queryArgsOf${ModelName}`,
    sortOfModel: `sortOf${ModelName}`,
    setPageOfModel: `setPageOf${ModelName}`,
    addPageOfModel: `addPageOf${ModelName}`,
  };
  const namesOfSlice = {
    modelList: sliceName.replace(names.model, names.modelList),
    modelListLoading: sliceName.replace(names.model, names.modelListLoading),
    modelInitList: sliceName.replace(names.model, names.modelInitList),
    modelInitAt: sliceName.replace(names.model, names.modelInitAt),
    modelInsight: sliceName.replace(names.model, names.modelInsight),
    pageOfModel: sliceName.replace(names.model, names.pageOfModel),
    lastPageOfModel: sliceName.replace(names.model, names.lastPageOfModel),
    limitOfModel: sliceName.replace(names.model, names.limitOfModel),
    queryArgsOfModel: sliceName.replace(names.model, names.queryArgsOfModel),
    sortOfModel: sliceName.replace(names.model, names.sortOfModel),
    setPageOfModel: sliceName.replace(names.model, names.setPageOfModel),
    addPageOfModel: sliceName.replace(names.model, names.addPageOfModel),
  };
  const modelList = storeUse[namesOfSlice.modelList]() as DataList<L>;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;
  const initQueryArgs = init[names.queryArgsOfModel] as object[];
  const initModelInitAt = init[names.modelInitAt] as Date;
  const initModelObjInsight = init[names.modelObjInsight] as BaseInsight;
  const initLimitOfModel = init[names.limitOfModel] as number;
  const initPageOfModel = init[names.pageOfModel] as number;

  const useCache =
    !modelListLoading &&
    isQueryEqual(storeGet<object[]>()[namesOfSlice.queryArgsOfModel], initQueryArgs) &&
    storeGet<Date>()[namesOfSlice.modelInitAt].getTime() >= initModelInitAt.getTime();
  if (useCache) loaded.current = true;

  const modelInitList = useMemo<DataList<L>>(() => {
    if (loaded.current) return modelList;
    const initModelObjList = init[names.modelObjList] as L[];
    const lightCrystalizeModel = cnst.lightCrystalize as (model: L) => L;
    return new DataList<L>(initModelObjList.map((model) => lightCrystalizeModel(model)));
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    const modelObjInsight = init[names.modelObjInsight] as BaseInsight;
    const crystalizeModelInsight = cnst.crystalizeInsight as (insight: BaseInsight) => {
      count: number;
    };
    const insight = crystalizeModelInsight(modelObjInsight);
    const initPageOfModel = init[names.pageOfModel] as number;
    const initLastPageOfModel = init[names.lastPageOfModel] as number;
    const initLimitOfModel = init[names.limitOfModel] as number;
    const initQueryArgsOfModel = init[names.queryArgsOfModel] as object[];
    const initSortOfModel = init[names.sortOfModel] as string;
    st.set({
      [namesOfSlice.modelList]: modelInitList,
      [namesOfSlice.modelInitList]: modelInitList,
      [namesOfSlice.modelInitAt]: initModelInitAt,
      [namesOfSlice.modelListLoading]: false,
      [namesOfSlice.modelInsight]: insight,
      [namesOfSlice.pageOfModel]: initPageOfModel,
      [namesOfSlice.lastPageOfModel]: initLastPageOfModel,
      [namesOfSlice.limitOfModel]: initLimitOfModel,
      [namesOfSlice.queryArgsOfModel]: initQueryArgsOfModel,
      [namesOfSlice.sortOfModel]: initSortOfModel,
    });
    loaded.current = true; //! 버그날수도 있슴
  }, []);

  const modelInsight = storeUse[namesOfSlice.modelInsight]() as BaseInsight;
  const limitOfModel = storeUse[namesOfSlice.limitOfModel]() as number;
  const pageOfModel = storeUse[namesOfSlice.pageOfModel]() as number;
  const insight = loaded.current ? modelInsight : initModelObjInsight;
  const limit = loaded.current ? limitOfModel : initLimitOfModel;
  const page = loaded.current ? pageOfModel : initPageOfModel;
  const moreProps = {
    total: insight.count,
    currentPage: page,
    itemsPerPage: limit || insight.count,
    onAddPage: async (page) => {
      await storeDo[namesOfSlice.addPageOfModel](page);
    },
    onPageSelect: (page: number) => {
      void storeDo[namesOfSlice.setPageOfModel](page);
      // if (scrollToTop) {
      window.parent.postMessage({ type: "pathChange", page }, "*");
      window.scrollTo({ top: 0, behavior: "instant" });
      // }
    },
    reverse,
  };

  const modelDataList = !loaded.current ? modelInitList.filter(filter).sort(sort) : modelList.filter(filter).sort(sort);
  if (renderList)
    return (
      <>
        {modelDataList.length ? (
          <ContainerWrapper
            containerRef={containerRef}
            className={clsx(className, {
              "grid-cols-1 md:grid-cols-1 lg:grid-cols-1": modelList.length === 0,
            })}
            noDiv={noDiv}
            pagination={pagination}
            moreProps={moreProps}
          >
            {renderList(modelDataList)}
          </ContainerWrapper>
        ) : typeof renderEmpty === "function" ? (
          renderEmpty()
        ) : null}
        {modelListLoading ? (loading ?? <Loading.Area />) : null}
      </>
    );
  else if (!renderItem) throw new Error("renderItem is required");

  const RenderItem = ({ model, idx }: { model: L; idx: number }) => renderItem(model, idx);

  return (
    <>
      <ContainerWrapper
        containerRef={containerRef}
        className={className}
        noDiv={noDiv}
        pagination={pagination}
        moreProps={moreProps}
      >
        {modelDataList.length
          ? (reverse ? [...modelDataList].reverse() : modelDataList)
              .slice(from ?? 0, to ?? modelDataList.length + 1)
              .map((model: L, idx: number) => <RenderItem key={model.id} model={model} idx={idx} />)
          : typeof renderEmpty === "function"
            ? renderEmpty()
            : null}
      </ContainerWrapper>
      {modelListLoading ? (loading ?? <Loading.Area />) : null}
    </>
  );
}

export default function Units<T extends string, M extends { id: string }, L extends { id: string }>({
  containerRef,
  className,
  init,
  noDiv,
  from,
  to,
  loading,
  renderItem,
  renderList,
  renderEmpty = noDiv
    ? () => null
    : () => (
        <div className="flex size-full items-center justify-center">
          <Empty />
        </div>
      ),
  filter = () => true,
  sort = (a, b) => 1,
  reverse,
  style,
  pagination = true,
}: UnitsProps<T, M, L>) {
  const props: UnitsProps<T, M, L> = {
    containerRef,
    className,
    style,
    init,
    noDiv,
    from,
    to,
    loading,
    renderItem,
    renderList,
    renderEmpty,
    filter,
    sort,
    reverse,
    pagination,
  };

  const { fulfilled, value: promiseInit } = useFetch(init);
  return fulfilled ? (
    promiseInit ? (
      <Render {...props} init={promiseInit} />
    ) : renderEmpty ? (
      <>{renderEmpty()}</>
    ) : (
      <div className="flex size-full items-center justify-center">
        <Empty />
      </div>
    )
  ) : loading ? (
    <>{loading}</>
  ) : (
    <div className="flex size-full items-center justify-center">
      <Loading.Skeleton active />
    </div>
  );
}

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

interface MoreWrapperProps {
  children: ReactNode;
  pagination?: boolean;
  moreProps: MoreProps;
}
const MoreWrapper = ({ children, pagination, moreProps }: MoreWrapperProps) => {
  return pagination ? <More {...moreProps}>{children}</More> : <>{children}</>;
};

interface ContainerWrapperProps {
  children: ReactNode;
  className?: string;
  containerRef?: RefObject<HTMLDivElement | null>;
  noDiv?: boolean;
  pagination?: boolean;
  moreProps: MoreProps;
}
const ContainerWrapper = ({
  children,
  className,
  containerRef,
  noDiv,
  pagination,
  moreProps,
}: ContainerWrapperProps) => {
  return noDiv ? (
    <MoreWrapper pagination={pagination} moreProps={moreProps}>
      {children}
    </MoreWrapper>
  ) : pagination ? (
    <MoreWrapper pagination={pagination} moreProps={moreProps}>
      <div ref={containerRef} className={className}>
        {children}
      </div>
    </MoreWrapper>
  ) : (
    <div ref={containerRef} className={className}>
      <MoreWrapper pagination={pagination} moreProps={moreProps}>
        {children}
      </MoreWrapper>
    </div>
  );
};
