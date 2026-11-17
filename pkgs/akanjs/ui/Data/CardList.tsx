"use client";
import type { DataList } from "akanjs/base";
import { cn, type DataAction, type DataColumn } from "akanjs/client";
import type { FilterInstance } from "akanjs/document";
import type { FetchInitForm, SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { type ReactNode, useEffect } from "react";
import { Empty } from "../Empty";
import { Loading } from "../Loading";
import { Model } from "../Model";
import { sliceNamesOf } from "../sliceNamesOf";
import DataItem from "./Item";
import DataPagination from "./Pagination";

const gridClassName = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

type DataItemProps<T extends string, _M extends { id: string }, L extends { id: string }> = {
  [key in T]: L;
} & { slice: SliceMeta };

interface CardListProps<
  T extends string,
  Input,
  Full extends { id: string },
  Light extends { id: string },
  Filter extends FilterInstance,
> {
  className?: string;
  cardListClassName?: string;
  init?: FetchInitForm<Input, Filter>;
  slice: SliceMeta;
  columns: DataColumn<any>[];
  actions?: DataAction[] | ((item: Light, idx: number) => DataAction[]);
  renderItem: (args: DataItemProps<T, Full, Light>) => ReactNode;
  renderLoading?: () => ReactNode;
  renderTemplate?: (props: any) => ReactNode | null;
  renderView?: (model: Full) => ReactNode | null;
  renderTitle?: (model: Full) => string | ReactNode;
}
export default function CardList<
  T extends string,
  Input,
  Full extends { id: string },
  Light extends { id: string },
  Filter extends FilterInstance,
>({
  className,
  cardListClassName = "",
  init,
  slice,
  actions,
  columns,
  renderItem,
  renderLoading,
  renderTemplate,
  renderView,
  renderTitle,
}: CardListProps<T, Input, Full, Light, Filter>) {
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const { refName, sliceName } = slice;
  const { names, namesOfSlice } = sliceNamesOf(refName, sliceName);
  const modelList = storeUse[namesOfSlice.modelList]() as DataList<Light>;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;
  const limitOfModel = storeUse[namesOfSlice.limitOfModel]() as number;
  const RenderItem: any = renderItem;
  useEffect(() => {
    if (init) void storeDo[namesOfSlice.initModel](init);
  }, []);
  const RenderTemplate = ({ id }: { id: string }) => {
    const Edit = renderTemplate;
    return Edit ? <Edit {...{ [names.modelId]: id }} /> : null;
  };
  return (
    <div className={className}>
      {modelListLoading ? (
        <div className={cn(gridClassName, cardListClassName)}>
          {new Array(limitOfModel || 20)
            .fill(0)
            .map((_, idx) => `skeleton-${idx}`)
            .map((key) =>
              renderLoading ? (
                renderLoading()
              ) : (
                <Loading.Skeleton key={key} className="rounded-box border border-border bg-card p-4" active />
              ),
            )}
        </div>
      ) : !modelList.length ? (
        <Empty />
      ) : (
        <div className={cn(gridClassName, cardListClassName)}>
          {modelList.map((model, idx) => {
            return (
              <DataItem
                key={model.id}
                model={model}
                slice={slice}
                actions={typeof actions === "function" ? actions(model, idx) : actions}
                columns={columns}
              >
                <RenderItem
                  {...({
                    [sliceName]: model,
                    slice,
                    actions: typeof actions === "function" ? actions(model, idx) : actions,
                    columns,
                    idx,
                  } as DataItemProps<T, Full, Light>)}
                />
              </DataItem>
            );
          })}
        </div>
      )}
      <DataPagination slice={slice} />
      {!modelListLoading
        ? modelList.map((model) => (
            <div key={model.id}>
              <Model.EditModal key={model.id} id={model.id} slice={slice} renderTitle={renderTitle}>
                <RenderTemplate id={model.id} />
              </Model.EditModal>
              {renderView ? (
                <Model.ViewModal
                  key={`${model.id}-view`}
                  id={model.id}
                  slice={slice}
                  renderTitle={renderTitle}
                  renderView={renderView}
                />
              ) : null}
            </div>
          ))
        : null}
    </div>
  );
}
