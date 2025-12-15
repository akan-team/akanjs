"use client";
import { type DataList } from "@akanjs/base";
import { DataAction, DataColumn, usePage } from "@akanjs/client";
import { capitalize } from "@akanjs/common";
import type { FilterInstance } from "@akanjs/document";
import { type FetchInitForm } from "@akanjs/signal";
import { st } from "@akanjs/store";
import { ReactNode, useEffect, useMemo } from "react";

import { Model } from "../Model";
import { Table } from "../Table";
import { Action, convToAntdColumn } from "./Item";
import DataPagination from "./Pagination";

interface TableListProps<
  T extends string,
  Input,
  Full extends { id: string },
  Light extends { id: string },
  Filter extends FilterInstance,
> {
  className?: string;
  queryArgs?: any[];
  init?: FetchInitForm<Input, Full, Filter>;
  sliceName: string;
  columns: DataColumn<any>[];
  renderTemplate?: (props: any) => ReactNode | null;
  renderTitle?: (model: Full) => string | ReactNode;
  renderView?: (model: Full) => ReactNode | null;
  actions?: DataAction[] | ((item: Light, idx: number) => DataAction[]);
  onItemClick?: (item: Light, idx: number) => void;
}
export default function TableList<
  T extends string,
  Input,
  Full extends { id: string },
  Light extends { id: string },
  Filter extends FilterInstance,
>({
  className,
  init,
  queryArgs = [],
  sliceName,
  columns,
  actions,
  renderTemplate,
  renderTitle,
  renderView,
  onItemClick,
}: TableListProps<T, Input, Full, Light, Filter>) {
  const { l } = usePage();
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
    initModel: `init${modelClassName}`,
  };
  const namesOfSlice = {
    modelList: sliceName.replace(names.model, names.modelList),
    modelListLoading: sliceName.replace(names.model, names.modelListLoading),
    initModel: sliceName.replace(names.model, names.initModel),
  };
  const modelList = storeUse[namesOfSlice.modelList]() as DataList<Light>;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;
  const RenderTemplate = ({ id }: { id: string }) => {
    const Edit = renderTemplate;
    return Edit ? <Edit {...{ [names.modelId]: id }} /> : null;
  };
  useEffect(() => {
    if (queryArgs.length) void storeDo[namesOfSlice.initModel](...(queryArgs as object[]), init);
  }, []);
  const cols = useMemo(() => {
    const firstCol = {
      ...convToAntdColumn(columns[0]),
      title:
        typeof columns[0] !== "string" && columns[0].title
          ? columns[0].title
          : l._(`${sliceName}.${typeof columns[0] === "string" ? columns[0] : (columns[0] as { key: string }).key}`),
    };
    return [
      {
        ...firstCol,
        render: (value, model: Light, idx: number) => (
          <div key={`${model.id}-${idx}`} className="flex items-center">
            <div className="mr-2">{firstCol.render ? firstCol.render(value, model) : value}</div>
            {actions &&
              (typeof actions === "function" ? actions(model, idx) : actions)
                .filter((action) => typeof action === "string")
                .map((action, idx) => (
                  <Action
                    key={`${model.id}-${action as unknown as string}`}
                    model={model}
                    action={action}
                    sliceName={sliceName}
                  />
                ))}
          </div>
        ),
      },
      ...columns.slice(1).map((col) => ({
        ...convToAntdColumn(col),
        title:
          typeof col !== "string" && col.title
            ? col.title
            : l._(`${sliceName}.${typeof col === "string" ? col : (col.key as string)}`),
      })),
      ...(actions
        ? [
            {
              key: "actions",
              dataIndex: "id",
              title: l("base.actions"),
              render: (_, model: Light, idx: number) => (
                <div className="flex gap-1">
                  {(typeof actions === "function" ? actions(model, idx) : actions)
                    .filter((action) => typeof action !== "string")
                    .map((action, idx) => (
                      <Action key={`${model.id}-${idx}`} model={model} action={action} sliceName={sliceName} />
                    ))}
                </div>
              ),
            },
          ]
        : []),
    ] as { key: string; dataIndex: string; title: string; render: (...args) => ReactNode }[];
  }, []);
  return (
    <div className={className}>
      <Table
        dataSource={(modelListLoading ? [] : [...modelList]) as any[]}
        columns={cols}
        loading={!!modelListLoading}
        size="small"
        rowKey={(model: Light) => model.id}
        pagination={false}
        onRow={(model: Light, idx: number) => ({
          onClick: () => onItemClick?.(model, idx),
        })}
      />
      <DataPagination sliceName={sliceName} />
      {!modelListLoading
        ? modelList.map((model) => (
            <div key={model.id}>
              <Model.EditModal id={model.id} sliceName={sliceName} renderTitle={renderTitle}>
                <RenderTemplate id={model.id} />
              </Model.EditModal>
              {renderView ? (
                <Model.ViewModal
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
