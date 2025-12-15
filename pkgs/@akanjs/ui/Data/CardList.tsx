"use client";
import { type DataList } from "@akanjs/base";
import { clsx, DataAction, DataColumn } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import type { FilterInstance } from "@akanjs/document";
import { type FetchInitForm } from "@akanjs/signal";
import { st } from "@akanjs/store";
import { ReactNode, useEffect } from "react";

import { Loading } from "../Loading";
import { Model } from "../Model";
import DataItem from "./Item";
import DataPagination from "./Pagination";

type DataItemProps<T extends string, M extends { id: string }, L extends { id: string }> = {
  [key in T]: L;
} & { sliceName: string };

interface CardListProps<
  T extends string,
  Input,
  Full extends { id: string },
  Light extends { id: string },
  Filter extends FilterInstance,
> {
  className?: string;
  cardListClassName?: string;
  init?: FetchInitForm<Input, Full, Filter>;
  sliceName: string;
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
  sliceName,
  actions,
  columns,
  renderItem,
  renderLoading,
  renderTemplate,
  renderView,
  renderTitle,
}: CardListProps<T, Input, Full, Light, Filter>) {
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const [modelName, modelClassName] = [refName, capitalize(refName)];
  const names = {
    model: modelName,
    modelId: `${modelName}Id`,
    modelList: `${modelName}List`,
    modelListLoading: `${modelName}ListLoading`,
    limitOfModel: `limitOf${modelClassName}`,
    initModel: `init${modelClassName}`,
  };
  const namesOfSlice = {
    modelList: sliceName.replace(names.model, names.modelList),
    modelListLoading: sliceName.replace(names.model, names.modelListLoading),
    limitOfModel: sliceName.replace(names.model, names.limitOfModel),
    initModel: sliceName.replace(names.model, names.initModel),
  };
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
        <div className={clsx("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5", cardListClassName)}>
          {new Array(limitOfModel || 20)
            .fill(0)
            .map((_, idx) => (renderLoading ? renderLoading() : <Loading.Skeleton key={idx} active />))}
        </div>
      ) : (
        <div className={clsx("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5", cardListClassName)}>
          {modelList.map((model, idx) => {
            return (
              <DataItem
                key={model.id}
                model={model}
                sliceName={sliceName}
                actions={typeof actions === "function" ? actions(model, idx) : actions}
                columns={columns}
              >
                <RenderItem
                  {...({
                    [sliceName]: model,
                    sliceName,
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
      <DataPagination sliceName={sliceName} />
      {!modelListLoading
        ? modelList.map((model) => (
            <div key={model.id}>
              <Model.EditModal key={model.id} id={model.id} sliceName={sliceName} renderTitle={renderTitle}>
                <RenderTemplate id={model.id} />
              </Model.EditModal>
              {renderView ? (
                <Model.ViewModal
                  key={`${model.id}-view`}
                  id={model.id}
                  sliceName={sliceName}
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
