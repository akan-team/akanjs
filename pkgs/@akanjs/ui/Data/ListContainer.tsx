"use client";
import { BaseInsight, DataList } from "@akanjs/base";
import { clsx, DataAction, DataColumn, DataTool, fetch, ModelInsightProps, ModelProps, usePage } from "@akanjs/client";
import { capitalize, deepObjectify } from "@akanjs/common";
import { type FetchInitForm } from "@akanjs/signal";
import { st } from "@akanjs/store";
import { saveAs } from "file-saver";
import React, { ReactNode, useEffect } from "react";
import {
  AiOutlineEllipsis,
  AiOutlineFileExcel,
  AiOutlineFileProtect,
  AiOutlinePlus,
  AiOutlineRedo,
} from "react-icons/ai";

import { Dropdown } from "../Dropdown";
import { Loading } from "../Loading";
import { Model } from "../Model";
import { Select } from "../Select";
import DataCardList from "./CardList";
// import QueryMaker from "./QueryMaker";
import DataTableList from "./TableList";

export interface ListContainerProps<
  T extends string,
  State,
  Input,
  Full extends { id: string },
  Light extends { id: string },
> {
  className?: string;
  cardListClassName?: string;
  type?: "card" | "list";
  query?: { [key: string]: any };
  init?: FetchInitForm<Input, Full, any>;
  sliceName: T;
  create?: boolean;
  title?: string;
  sort?: any;
  columns?: DataColumn<any>[];
  tools?: DataTool[] | ((modelList: Light[]) => DataTool[]);
  actions?: DataAction[] | ((item: Light, idx: number) => DataAction[]);
  renderDashboard?: ({
    summary,
    hidePresents,
  }: {
    summary: { [key: string]: any };
    hidePresents?: boolean;
  }) => ReactNode;
  renderItem?: (props: ModelProps<any, any>) => ReactNode;
  renderTemplate?: (props: any) => ReactNode | null;
  renderTitle?: (model: Full) => string | ReactNode;
  renderView?: (model: Full) => ReactNode | null;
  renderQueryMaker?: () => ReactNode;
  renderInsight?: (props: ModelInsightProps) => ReactNode;
  renderLoading?: () => ReactNode;
}

export default function ListContainer<
  T extends string,
  State,
  Input,
  Full extends { id: string },
  Light extends { id: string },
>({
  className,
  cardListClassName,
  type = "card",
  query,
  init,
  create = true,
  sliceName,
  title,
  sort,
  columns = ["id", "createdAt", "updatedAt"],
  actions = ["remove", "edit", "view"],
  tools = [],
  renderDashboard,
  renderItem,
  renderTemplate,
  renderTitle,
  renderView,
  renderQueryMaker = () => <></>,
  renderInsight,
  renderLoading,
}: ListContainerProps<T, State, Input, Full, Light>) {
  const { l } = usePage();
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const [modelName, modelClassName] = [refName, capitalize(refName)];
  if (refName !== sliceName) throw new Error("ListContainer: sliceName must be the same as refName");
  const names = {
    model: modelName,
    modelList: `${modelName}List`,
    modelListLoading: `${modelName}ListLoading`,
    modelInsight: `${modelName}Insight`,
    limitOfModel: `limitOf${modelClassName}`,
    sortOfModel: `sortOf${modelClassName}`,
    initModel: `init${modelClassName}`,
    newModel: `new${modelClassName}`,
    refreshModel: `refresh${modelClassName}`,
    setSortOfModel: `setSortOf${modelClassName}`,
    setLimitOfModel: `setLimitOf${modelClassName}`,
    modelSortKeys: `${modelName}SortKeys`,
  };
  const namesOfSlice = {
    modelList: sliceName.replace(names.model, names.modelList),
    modelListLoading: sliceName.replace(names.model, names.modelListLoading),
    modelInsight: sliceName.replace(names.model, names.modelInsight),
    limitOfModel: sliceName.replace(names.model, names.limitOfModel),
    sortOfModel: sliceName.replace(names.model, names.sortOfModel),
    initModel: sliceName.replace(names.model, names.initModel),
    newModel: sliceName.replace(names.model, names.newModel),
    refreshModel: sliceName.replace(names.model, names.refreshModel),
    setSortOfModel: sliceName.replace(names.model, names.setSortOfModel),
    setLimitOfModel: sliceName.replace(names.model, names.setLimitOfModel),
  };
  const limitOfModel = storeUse[namesOfSlice.limitOfModel]();
  const sortOfModel = storeUse[namesOfSlice.sortOfModel]();
  const modelInsight = storeUse[namesOfSlice.modelInsight]() as BaseInsight;
  useEffect(() => {
    void storeDo[namesOfSlice.initModel]();
  }, []);

  const RenderTitle =
    renderTitle ?? ((model: Full) => `${l._(`${refName}.modelName`)} - ${model.id ? model.id : "New"}`);
  const ModelDashboard = (): ReactNode => {
    const summary = storeUse.summary();
    const summaryLoading = storeUse.summaryLoading();
    const Stat = renderDashboard;
    if (!Stat) return <></>;
    return (
      <div className="mb-4">
        {!summary || summaryLoading ? <Loading.Skeleton active /> : <Stat summary={summary} hidePresents />}
      </div>
    );
  };
  const RenderQueryMaker = renderQueryMaker;
  const RenderInsight = (): ReactNode => {
    const modelInsight = storeUse[namesOfSlice.modelInsight]() as BaseInsight;
    return renderInsight ? renderInsight({ insight: modelInsight }) : <></>;
  };
  const RenderTemplate = renderTemplate;
  const RenderTools = (): ReactNode => {
    const modelList = storeUse[namesOfSlice.modelList]() as DataList<Light>;
    const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;
    const toolList = modelListLoading
      ? []
      : [
          ...(Array.isArray(tools) ? tools : tools([...modelList])),
          {
            render: () => (
              <div
                className="btn btn-sm btn-ghost flex flex-nowrap justify-start gap-2"
                onClick={() => {
                  const header = columns
                    .map((column) => {
                      if (typeof column === "string") return l._(`${sliceName}.${column}`);
                      else if (column.title) return column.title;
                      else return l._(`${sliceName}.${column.key as string}`);
                    })
                    .join("\t");
                  const body = modelList
                    .map((model) => {
                      const line = (
                        columns.map((column) => {
                          if (typeof column === "string") return model[column] as string;
                          else if (column.value) return column.value(model[column.key], model);
                          else if (column.render) return column.render(model[column.key], model);
                          else return model[column.key] as string;
                        }) as string[]
                      ).join("\t");
                      return line;
                    })
                    .join("\n");
                  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
                  saveAs(blob, `${sliceName}.csv`);
                }}
              >
                <AiOutlineFileExcel />
                <span>Export CSV</span>
              </div>
            ),
          },
          {
            render: () => (
              <div
                className="btn btn-sm btn-ghost flex flex-nowrap justify-start gap-2"
                onClick={() => {
                  const json = JSON.stringify(deepObjectify([...modelList], { serializable: true }));
                  const blob = new Blob([json], { type: "application/json" });
                  saveAs(blob, `${sliceName}.json`);
                }}
              >
                <AiOutlineFileProtect />
                <span>Export JSON</span>
              </div>
            ),
          },
        ];
    return (
      <Dropdown
        buttonClassName={`btn btn-primary btn-sm ${renderTemplate && create ? "rounded-l-none" : ""}`}
        value={<AiOutlineEllipsis />}
        content={
          <>
            {toolList.map((tool, idx) => (
              <tool.render key={idx} />
            ))}
          </>
        }
      />
    );
  };
  const RenderSort = (): ReactNode => {
    return (
      <Select<string>
        value={sortOfModel as string}
        options={
          (fetch as unknown as { [key: string]: string[] | undefined })[names.modelSortKeys]?.map((sortKey) => ({
            label: l._(`${refName}.${sortKey}`),
            value: sortKey,
          })) ?? []
        }
        onChange={(sortKey) => void storeDo[namesOfSlice.setSortOfModel](sortKey)}
      />
    );
  };
  return (
    <div className={clsx("m-4", className)}>
      <div className="mb-3 flex flex-wrap justify-between">
        <div className="flex pb-1">
          <p className="prose text-lg">
            {title ?? l._(`${sliceName}.modelName`)}({modelInsight.count})
          </p>
          <div className="ml-3 flex items-center">
            {renderTemplate && create ? (
              <button
                onClick={() => void storeDo[namesOfSlice.newModel]()}
                className={`btn btn-sm btn-primary mr-[0.5px] rounded-r-none`}
              >
                <AiOutlinePlus /> {l("base.new")}
              </button>
            ) : null}
            <RenderTools />
          </div>
        </div>
        <div className="flex">
          <button
            className="btn btn-primary btn-sm btn-square mx-1"
            onClick={() => void storeDo[namesOfSlice.refreshModel]()}
          >
            <AiOutlineRedo className="mx-2" />
          </button>
          <RenderSort />
          <Select<number>
            value={limitOfModel as number}
            options={[10, 20, 50, 100].map((limit) => ({
              label: `${limit} ${l("base.perPage")}`,
              value: limit,
            }))}
            onChange={(limit) => void storeDo[namesOfSlice.setLimitOfModel](limit)}
          />
        </div>
      </div>
      {!query && <ModelDashboard />}
      {/* <QueryMaker className="mb-4" sliceName={sliceName} query={query} /> */}
      <RenderQueryMaker />
      <RenderInsight />
      {type === "card" ? (
        <DataCardList
          sliceName={sliceName}
          renderItem={renderItem ?? (({ [sliceName]: model }) => null)}
          renderLoading={renderLoading}
          renderTemplate={renderTemplate}
          renderView={renderView}
          renderTitle={RenderTitle}
          columns={columns}
          actions={actions}
          cardListClassName={cardListClassName}
        />
      ) : (
        <DataTableList
          columns={columns}
          sliceName={sliceName}
          actions={actions}
          renderTemplate={renderTemplate}
          renderTitle={RenderTitle}
          renderView={renderView}
        />
      )}
      <Model.EditModal sliceName={sliceName} renderTitle={RenderTitle}>
        {RenderTemplate ? <RenderTemplate /> : null}
      </Model.EditModal>
    </div>
  );
}
