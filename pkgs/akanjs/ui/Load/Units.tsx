"use client";
import { DataList } from "akanjs/base";
import { cn } from "akanjs/client";
import { capitalize, isQueryEqual, lowerlize } from "akanjs/common";
import type { BaseInsight } from "akanjs/constant";
import { ConstantRegistry, labelOf } from "akanjs/constant";
import type { ClientInit, ServerInit } from "akanjs/fetch";
import { st } from "akanjs/store";
import { useFetch, usePageTool, useScreenScope } from "akanjs/webkit";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef } from "react";

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
  renderEmpty?: null | (() => ReactNode) | false;
  renderItem?: (item: L, idx: number) => ReactNode;
  renderList?: (list: DataList<L>) => ReactNode;
  reverse?: boolean;
  pagination?: boolean;
  /** Max age in ms of the cached slice data before the client refetches on mount; `0` always refetches. */
  staleTime?: number;
}

interface UnitsProps<RefName extends string, Light extends { id: string }> extends DefaultProps<Light> {
  init: ClientInit<RefName, Light>;
}

interface RenderProps<RefName extends string, Light extends { id: string }> extends DefaultProps<Light> {
  init: ServerInit<RefName, Light>;
}

function Render<RefName extends string, Light extends { id: string }>({
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
  staleTime,
}: RenderProps<RefName, Light>) {
  const loaded = useRef(false);
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const { refName, sliceName } = init;
  const [modelName, ModelName] = [lowerlize(refName), capitalize(refName)];
  const cnst = ConstantRegistry.getDatabase(refName);
  const names = {
    model: modelName,
    modelList: `${modelName}List`,
    modelListLoading: `${modelName}ListLoading`,
    modelInsight: `${modelName}Insight`,
    modelInitList: `${modelName}InitList`,
    modelInitAt: `${modelName}InitAt`,
    modelStaleAt: `${modelName}StaleAt`,
    modelObjList: `${modelName}ObjList`,
    modelObjInsight: `${modelName}ObjInsight`,
    pageOfModel: `pageOf${ModelName}`,
    lastPageOfModel: `lastPageOf${ModelName}`,
    limitOfModel: `limitOf${ModelName}`,
    queryArgsOfModel: `queryArgsOf${ModelName}`,
    sortOfModel: `sortOf${ModelName}`,
    setPageOfModel: `setPageOf${ModelName}`,
    addPageOfModel: `addPageOf${ModelName}`,
    refreshModel: `refresh${ModelName}`,
  };
  const namesOfSlice = {
    modelList: sliceName.replace(names.model, names.modelList),
    modelListLoading: sliceName.replace(names.model, names.modelListLoading),
    modelInitList: sliceName.replace(names.model, names.modelInitList),
    modelInitAt: sliceName.replace(names.model, names.modelInitAt),
    modelStaleAt: sliceName.replace(names.model, names.modelStaleAt),
    modelInsight: sliceName.replace(names.model, names.modelInsight),
    pageOfModel: sliceName.replace(names.model, names.pageOfModel),
    lastPageOfModel: sliceName.replace(names.model, names.lastPageOfModel),
    limitOfModel: sliceName.replace(names.model, names.limitOfModel),
    queryArgsOfModel: sliceName.replace(names.model, names.queryArgsOfModel),
    sortOfModel: sliceName.replace(names.model, names.sortOfModel),
    setPageOfModel: sliceName.replace(names.model, names.setPageOfModel),
    addPageOfModel: sliceName.replace(names.model, names.addPageOfModel),
    refreshModel: sliceName.replace(names.model, names.refreshModel),
  };
  const modelList = storeUse[namesOfSlice.modelList]() as DataList<Light>;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;
  const initQueryArgs = (init as any)[names.queryArgsOfModel] as object[];
  const initModelInitAt = (init as any)[names.modelInitAt] as Date;
  const initModelObjInsight = (init as any)[names.modelObjInsight] as BaseInsight;
  const initLimitOfModel = (init as any)[names.limitOfModel] as number;
  const initPageOfModel = (init as any)[names.pageOfModel] as number;

  const useCache =
    !modelListLoading &&
    isQueryEqual(storeGet<object[]>()[namesOfSlice.queryArgsOfModel], initQueryArgs) &&
    storeGet<Date>()[namesOfSlice.modelInitAt].getTime() >= initModelInitAt.getTime();
  if (useCache) loaded.current = true;

  const modelInitList = useMemo<DataList<Light>>(() => {
    if (loaded.current) return modelList;
    const initModelObjList = (init as any)[names.modelObjList] as Light[];
    return new DataList<Light>(initModelObjList.map((model) => new cnst.light().set(model) as unknown as Light));
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    const modelObjInsight = (init as any)[names.modelObjInsight] as BaseInsight;
    const insight = new cnst.insight().set(modelObjInsight) as unknown as BaseInsight;
    const initPageOfModel = (init as any)[names.pageOfModel] as number;
    const initLastPageOfModel = (init as any)[names.lastPageOfModel] as number;
    const initLimitOfModel = (init as any)[names.limitOfModel] as number;
    const initQueryArgsOfModel = (init as any)[names.queryArgsOfModel] as object[];
    const initSortOfModel = (init as any)[names.sortOfModel] as string;
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
    loaded.current = true;
  }, []);

  useEffect(() => {
    const modelStaleAt = storeGet<Date>()[namesOfSlice.modelStaleAt];
    const staleThreshold = Math.max(modelStaleAt.getTime(), staleTime === undefined ? 0 : Date.now() - staleTime);
    if (storeGet<Date>()[namesOfSlice.modelInitAt].getTime() >= staleThreshold) return;
    if (storeGet<boolean>()[namesOfSlice.modelListLoading]) return;
    void storeDo[namesOfSlice.refreshModel]({ invalidate: true });
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
    onAddPage: async (page: number) => {
      await storeDo[namesOfSlice.addPageOfModel](page);
    },
    onPageSelect: (page: number, option?: { scrollToTop?: boolean }) => {
      void storeDo[namesOfSlice.setPageOfModel](page);
      // if (scrollToTop) {
      if (option?.scrollToTop !== false) {
        window.parent.postMessage({ type: "pathChange", page }, "*");
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      // }
    },
    reverse,
  };
  usePageTool({
    name: pagination && insight.count > limit ? namesOfSlice.setPageOfModel : null,
    model: modelName,
    page,
    lastPage: Math.ceil(insight.count / (limit || insight.count || 1)),
    total: insight.count,
    onSelect: (page) => moreProps.onPageSelect(page, { scrollToTop: false }),
  });

  const modelDataList = !loaded.current ? modelInitList.filter(filter).sort(sort) : modelList.filter(filter).sort(sort);
  const scopePath = useScreenScope({
    id: sliceName,
    kind: refName,
    items: () =>
      modelDataList.map((item) => {
        const label = labelOf(cnst.full, item);
        return { id: item.id, ...(label ? { label } : {}) };
      }),
  });
  const showLoading = loaded.current && modelListLoading;
  if (renderList)
    return (
      <>
        {modelDataList.length || renderEmpty === false ? (
          <ContainerWrapper
            containerRef={containerRef}
            className={cn(className, modelDataList.length === 0 && "grid-cols-1 md:grid-cols-1 lg:grid-cols-1")}
            noDiv={noDiv}
            pagination={pagination}
            moreProps={moreProps}
            scope={scopePath}
          >
            {renderList(modelDataList)}
          </ContainerWrapper>
        ) : typeof renderEmpty === "function" ? (
          renderEmpty()
        ) : null}
        {showLoading ? (loading ?? <Loading.Area />) : null}
      </>
    );
  else if (!renderItem) throw new Error("renderItem is required");

  const RenderItem = ({ model, idx }: { model: Light; idx: number }) => renderItem(model, idx);
  return (
    <>
      <ContainerWrapper
        containerRef={containerRef}
        className={className}
        noDiv={noDiv}
        pagination={pagination}
        moreProps={moreProps}
        scope={scopePath}
      >
        {modelDataList.length
          ? (reverse ? [...modelDataList].reverse() : modelDataList)
              .slice(from ?? 0, to ?? modelDataList.length + 1)
              .map((model: Light, idx: number) => <RenderItem key={model.id} model={model} idx={idx} />)
          : typeof renderEmpty === "function"
            ? renderEmpty()
            : null}
      </ContainerWrapper>
      {showLoading ? (loading ?? <Loading.Area />) : null}
    </>
  );
}

export default function Units<RefName extends string, Light extends { id: string }>({
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
  staleTime,
}: UnitsProps<RefName, Light>) {
  const props: UnitsProps<RefName, Light> = {
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
    staleTime,
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
  onAddPage: (page: number) => Promise<void>;
  onPageSelect: (page: number, option?: { scrollToTop?: boolean }) => void;
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
  scope?: string;
}
const ContainerWrapper = ({
  children,
  className,
  containerRef,
  noDiv,
  pagination,
  moreProps,
  scope,
}: ContainerWrapperProps) => {
  return noDiv ? (
    <MoreWrapper pagination={pagination} moreProps={moreProps}>
      {children}
    </MoreWrapper>
  ) : pagination ? (
    <MoreWrapper pagination={pagination} moreProps={moreProps}>
      <div ref={containerRef} className={className} data-agent-scope={scope}>
        {children}
      </div>
    </MoreWrapper>
  ) : (
    <div ref={containerRef} className={className} data-agent-scope={scope}>
      <MoreWrapper pagination={pagination} moreProps={moreProps}>
        {children}
      </MoreWrapper>
    </div>
  );
};
