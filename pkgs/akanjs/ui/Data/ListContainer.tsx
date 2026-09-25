"use client";
import type { DataList } from "akanjs/base";
import {
  clsx,
  type DataAction,
  type DataColumn,
  type DataTool,
  fetch,
  type ModelInsightProps,
  type ModelProps,
  usePage,
} from "akanjs/client";
import { capitalize, deepObjectify } from "akanjs/common";
import type { BaseInsight } from "akanjs/constant";
import type { FetchInitForm, SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { type ReactNode, useEffect } from "react";
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

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export interface ListContainerProps<
  T extends string,
  State,
  Input,
  Full extends { id: string },
  Light extends { id: string },
> {
  /** Additional classes for the list container. */
  className?: string;
  /** Additional classes for card-list rendering. */
  cardListClassName?: string;
  /** Render as cards or table/list. */
  type?: "card" | "list";
  /** Static query object passed to the generated init action. */
  query?: Record<string, unknown>;
  /** Initial fetch form/filter values. */
  init?: FetchInitForm<Input, any>;
  /** Generated slice metadata for the target model. */
  slice: SliceMeta;
  /** Show create/new-model controls. */
  create?: boolean;
  /** Optional list title. */
  title?: string;
  /** Initial sort value. */
  sort?: unknown;
  /** Table/list columns. */
  columns?: DataColumn<any>[];
  /** Toolbar actions or a factory receiving the loaded list. */
  tools?: DataTool[] | ((modelList: Light[]) => DataTool[]);
  /** Per-row actions or action factory. */
  actions?: DataAction[] | ((item: Light, idx: number) => DataAction[]);
  renderDashboard?: ({
    summary,
    hidePresents,
  }: {
    summary: Record<string, unknown>;
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
  slice,
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
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const { refName, sliceName } = slice;
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
        {!summary || summaryLoading ? (
          <Loading.Skeleton active />
        ) : (
          <Stat summary={summary as Record<string, unknown>} hidePresents />
        )}
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
            key: "export-csv",
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
                          if (typeof column === "string") return model[column as keyof typeof model] as string;
                          else if (column.value) return column.value(model[column.key as keyof typeof model], model);
                          else if (column.render) return column.render(model[column.key as keyof typeof model], model);
                          else return model[column.key as keyof typeof model] as string;
                        }) as string[]
                      ).join("\t");
                      return line;
                    })
                    .join("\n");
                  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
                  downloadBlob(blob, `${sliceName}.csv`);
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
                  downloadBlob(blob, `${sliceName}.json`);
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
        content={toolList.map((tool) => <tool.render key={tool.key} />)}
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
          slice={slice}
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
          slice={slice}
          actions={actions}
          renderTemplate={renderTemplate}
          renderTitle={RenderTitle}
          renderView={renderView}
        />
      )}
      <Model.EditModal slice={slice} renderTitle={RenderTitle}>
        {RenderTemplate ? <RenderTemplate /> : null}
      </Model.EditModal>
    </div>
  );
}
