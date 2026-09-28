"use client";
import { type DataList, ID, Int } from "akanjs/base";
import {
  cn,
  type DataAction,
  type DataColumn,
  type DataTool,
  fetch,
  type ModelInsightProps,
  type ModelProps,
  usePage,
} from "akanjs/client";
import { type BaseInsight, ConstantRegistry, labelOf } from "akanjs/constant";
import type { FetchInitForm, QuerySetting, SliceMeta } from "akanjs/fetch";
import { st } from "akanjs/store";
import { usePageLocation, useScreenScope } from "akanjs/webkit";
import { type ReactNode, useEffect, useState } from "react";
import {
  AiOutlineAppstore,
  AiOutlineFileExcel,
  AiOutlineFileText,
  AiOutlineMore,
  AiOutlinePlus,
  AiOutlineRedo,
  AiOutlineUnorderedList,
} from "react-icons/ai";

import { agentAttrs } from "../agentAttrs";
import { badgeRecipe } from "../Badge";
import { buttonRecipe } from "../Button";
import { Dropdown } from "../Dropdown";
import { Loading } from "../Loading";
import { Model } from "../Model";
import { Select } from "../Select";
import { sliceNamesOf } from "../sliceNamesOf";
import DataCardList from "./CardList";
import { columnKey, downloadBlob, toCsvBlob, toJsonBlob } from "./dataExport";
import { dictLabel } from "./dataText";
import { QueryMakerArgs, QueryMakerKey, resolveQuerySetting, useQueryMaker } from "./QueryMaker";
import DataTableList from "./TableList";

const controlClassName = "h-9";
const pageLimits = [10, 20, 50, 100];
const menuItemClassName = "flex w-full flex-nowrap justify-start gap-2";

export interface ListContainerProps<
  T extends string,
  State,
  Input,
  Full extends { id: string },
  Light extends { id: string },
> {
  className?: string;
  cardListClassName?: string;
  /** Initial mode; the toolbar toggle switches it from here. */
  type?: "card" | "list";
  /** Fixed filter query for this listing. Given one, the panel is scoped and offers no query maker. */
  query?: QuerySetting;
  /** Summary column to filter query. A `?filter=<column>` link opens the listing on the query it names. */
  queryMap?: { [column: string]: QuerySetting };
  /** Initial fetch form: page, limit, sort, and the default values a new model starts from. */
  init?: FetchInitForm<Input, any>;
  slice: SliceMeta;
  create?: boolean;
  title?: ReactNode;
  sort?: unknown;
  columns?: DataColumn<any>[];
  tools?: DataTool[] | ((modelList: Light[]) => DataTool[]);
  actions?: DataAction[] | ((item: Light, idx: number) => DataAction[]);
  renderDashboard?: ({
    summary,
    hidePresents,
    onSelect,
    queryKey,
  }: {
    summary: Record<string, unknown>;
    hidePresents?: boolean;
    /** Applies one summary column's filter to this listing, in place. */
    onSelect: (setting: QuerySetting) => void;
    /** The filter key the listing is showing right now. */
    queryKey: string;
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
  queryMap,
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
  renderQueryMaker,
  renderInsight,
  renderLoading,
}: ListContainerProps<T, State, Input, Full, Light>) {
  const { l } = usePage();
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args: any[]) => Promise<void> };
  const storeSel = st.sel as <Ret>(selector: (state: unknown) => Ret) => Ret;
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const { refName, sliceName } = slice;
  if (refName !== sliceName) throw new Error("ListContainer: sliceName must be the same as refName");
  const { namesOfSlice } = sliceNamesOf(refName, sliceName);
  const [view, setView] = useState(type);
  const limitOfModel = storeUse[namesOfSlice.limitOfModel]() as number;
  const sortOfModel = storeUse[namesOfSlice.sortOfModel]() as string;
  const modelInsight = storeUse[namesOfSlice.modelInsight]() as BaseInsight;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;
  const { searchParams } = usePageLocation();
  const filter = Array.isArray(searchParams.filter) ? searchParams.filter[0] : searchParams.filter;
  const initQuery = query ?? (filter ? queryMap?.[filter] : undefined);
  const queryState = useQueryMaker({ slice, query: initQuery });
  useEffect(() => {
    // The init form rides the argument after the slice's own, so every positional slot has to be filled first.
    const queryArgs = new Array(slice.argLength).fill(null) as unknown[];
    if (initQuery) {
      const { queryKey, args } = resolveQuerySetting(initQuery);
      [queryArgs[0], queryArgs[1]] = [queryKey, args];
    }
    void storeDo[namesOfSlice.initModel](...queryArgs, { sort, ...init });
  }, []);

  // Toolbar controls publish under their store action's name; one the toolbar does not draw registers nothing.
  const sortKeys = fetch.sortKeyMap?.get(refName) ?? [];
  const columnTitle = (column: DataColumn<any>) =>
    typeof column !== "string" && column.title
      ? column.title
      : dictLabel(l._, `${sliceName}.${columnKey(column)}`, columnKey(column));
  const loadedList = () => [...(storeGet<DataList<Light>>()[namesOfSlice.modelList] as DataList<Light>)];
  const whileLoaded = () => (modelListLoading ? `The ${refName} list is still loading.` : true);
  const setViewOfModel = st
    .tool(namesOfSlice.setViewOfModel)
    .desc(`Render the ${refName} list as cards or as a table.`)
    .arg("mode", String, { oneOf: ["card", "list"] })
    .exec((mode) => {
      setView(mode);
    });
  const setSortOfModel = st
    .tool(sortKeys.length > 1 ? namesOfSlice.setSortOfModel : null)
    .desc(`Reorder the ${refName} list.`)
    .arg("sortKey", String, { oneOf: sortKeys })
    .exec((sortKey) => storeDo[namesOfSlice.setSortOfModel](sortKey));
  const setLimitOfModel = st
    .tool(namesOfSlice.setLimitOfModel)
    .desc(`Set how many ${refName} rows one page holds.`)
    .arg("limit", Int, { oneOf: pageLimits })
    .exec((limit) => storeDo[namesOfSlice.setLimitOfModel](limit));
  const refreshModel = st
    .tool(namesOfSlice.refreshModel, { settle: false })
    .desc(`Reload the ${refName} list from the server.`)
    .exec(() => storeDo[namesOfSlice.refreshModel]());
  const newModel = st
    .tool(renderTemplate && create ? namesOfSlice.newModel : null)
    .desc(`Open the form that creates a ${refName}.`)
    .exec(() => storeDo[namesOfSlice.newModel]());
  const exportCsvOfModel = st
    .tool(namesOfSlice.exportCsvOfModel, { guard: whileLoaded })
    .desc(`Download the loaded page of ${refName} rows as a CSV file.`)
    .exec(() => {
      downloadBlob(toCsvBlob(columns, loadedList() as Record<string, unknown>[], columnTitle), `${sliceName}.csv`);
    });
  const exportJsonOfModel = st
    .tool(namesOfSlice.exportJsonOfModel, { guard: whileLoaded })
    .desc(`Download the loaded page of ${refName} rows as a JSON file.`)
    .exec(() => {
      downloadBlob(toJsonBlob(loadedList()), `${sliceName}.json`);
    });

  // Row verbs for the buttons `Data.Item` draws, taking the id as an argument; an `actions` factory decides per row,
  // so it publishes none. The editor's own verbs come from `Model.EditModal`/`ViewModal` while they are open.
  const rowActions = Array.isArray(actions) ? actions : [];
  st.tool(rowActions.includes("edit") && renderTemplate ? namesOfSlice.editModel : null)
    .desc(`Open one ${refName} in the edit form.`)
    .arg("modelId", ID)
    .exec((modelId) => storeDo[namesOfSlice.editModel](modelId));
  st.tool(rowActions.includes("view") && renderView ? namesOfSlice.viewModel : null)
    .desc(`Open one ${refName} in the detail view.`)
    .arg("modelId", ID)
    .exec((modelId) => storeDo[namesOfSlice.viewModel](modelId));
  st.tool(rowActions.includes("remove") ? namesOfSlice.removeModel : null)
    .desc(`Remove one ${refName}.`)
    .arg("modelId", ID)
    .exec((modelId) => storeDo[namesOfSlice.removeModel](modelId));
  const scopePath = useScreenScope({
    id: sliceName,
    kind: refName,
    items: () =>
      [...(storeGet<DataList<Light>>()[namesOfSlice.modelList] as DataList<Light>)].map((item) => {
        const label = labelOf(ConstantRegistry.getDatabase(refName).full, item);
        return { id: item.id, ...(label ? { label } : {}) };
      }),
  });

  const modelLabel = dictLabel(l._, `${sliceName}.modelName`, refName);
  const RenderTitle = renderTitle ?? ((model: Full) => `${modelLabel} - ${model.id ? model.id : "New"}`);
  // `summary` is an app-level state key, so it is read off the state; built as a value, not `<ModelDashboard />`,
  // since a component type created in render remounts every render and loses the picked tile.
  const summary = storeSel<Record<string, unknown> | undefined>(
    (state) => (state as { summary?: Record<string, unknown> }).summary,
  );
  const summaryLoading = storeSel<boolean>((state) => !!(state as { summaryLoading?: boolean }).summaryLoading);
  const modelDashboard =
    !renderDashboard || !summary ? null : summaryLoading ? (
      <Loading.Skeleton className="mb-4" active />
    ) : (
      renderDashboard({
        summary,
        hidePresents: true,
        onSelect: queryState.applySetting,
        queryKey: queryState.setting.queryKey,
      })
    );
  // Called, not mounted, for the same remount reason; a fixed `query` is the panel's scope, so no maker is drawn.
  const queryMakerArgs = renderQueryMaker ? (
    renderQueryMaker()
  ) : query ? null : (
    <QueryMakerArgs slice={slice} state={queryState} />
  );
  const RenderInsight = (): ReactNode => (renderInsight ? renderInsight({ insight: modelInsight }) : null);
  const RenderTemplate = renderTemplate;
  const RenderTools = (): ReactNode => {
    const modelList = storeUse[namesOfSlice.modelList]() as DataList<Light>;
    const toolList: DataTool[] = modelListLoading
      ? []
      : [
          ...(Array.isArray(tools) ? tools : tools([...modelList])),
          {
            key: "export-csv",
            render: () => (
              <button
                type="button"
                className={buttonRecipe({ variant: "ghost", size: "sm" }, menuItemClassName)}
                onClick={exportCsvOfModel}
                {...agentAttrs(exportCsvOfModel)}
              >
                <AiOutlineFileExcel />
                <span>{l("base.exportCsv")}</span>
              </button>
            ),
          },
          {
            key: "export-json",
            render: () => (
              <button
                type="button"
                className={buttonRecipe({ variant: "ghost", size: "sm" }, menuItemClassName)}
                onClick={exportJsonOfModel}
                {...agentAttrs(exportJsonOfModel)}
              >
                <AiOutlineFileText />
                <span>{l("base.exportJson")}</span>
              </button>
            ),
          },
        ];
    return (
      <Dropdown
        buttonClassName={buttonRecipe({ variant: "outline", size: "icon" }, ["size-9", controlClassName])}
        value={<AiOutlineMore />}
        content={toolList.map((tool) => (
          <li key={tool.key}>
            <tool.render />
          </li>
        ))}
      />
    );
  };
  const RenderSort = (): ReactNode => {
    if (sortKeys.length < 2) return null;
    return (
      <Select<string>
        className="w-36 min-w-0"
        selectClassName={cn("min-h-0", controlClassName)}
        value={sortOfModel}
        options={sortKeys.map((sortKey) => ({
          label: dictLabel(l._, `${refName}.sort.${sortKey}`, sortKey),
          value: sortKey,
        }))}
        onChange={setSortOfModel}
      />
    );
  };
  return (
    <div className={cn("w-full p-4", className)} data-agent-scope={scopePath}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate font-semibold text-foreground text-xl tracking-tight">{title ?? modelLabel}</h2>
          <span className={badgeRecipe({ variant: "outline", size: "sm" }, "tabular-nums")}>
            {modelInsight.count.toLocaleString()}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-field border border-border p-0.5">
            {(["card", "list"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                title={mode === "card" ? l("base.cardView") : l("base.tableView")}
                className={buttonRecipe({ variant: view === mode ? "default" : "ghost", size: "sm" }, "h-8 px-2.5")}
                onClick={() => {
                  void setViewOfModel(mode);
                }}
                {...agentAttrs(setViewOfModel)}
              >
                {mode === "card" ? <AiOutlineAppstore /> : <AiOutlineUnorderedList />}
                <span className="sr-only">{mode === "card" ? l("base.cardView") : l("base.tableView")}</span>
              </button>
            ))}
          </div>
          {query ? null : (
            <QueryMakerKey
              className="w-44 min-w-0"
              selectClassName={cn("min-h-0", controlClassName)}
              slice={slice}
              state={queryState}
            />
          )}
          <RenderSort />
          <Select<number>
            className="w-36 min-w-0"
            selectClassName={cn("min-h-0", controlClassName)}
            value={limitOfModel}
            options={pageLimits.map((limit) => ({
              label: `${limit} ${l("base.perPage")}`,
              value: limit,
            }))}
            onChange={setLimitOfModel}
          />
          <button
            type="button"
            title={l("base.refresh")}
            className={buttonRecipe({ variant: "outline", size: "icon" }, ["size-9", controlClassName])}
            onClick={refreshModel}
            {...agentAttrs(refreshModel)}
          >
            <AiOutlineRedo className={modelListLoading ? "animate-spin" : ""} />
          </button>
          <RenderTools />
          {renderTemplate && create ? (
            <button
              type="button"
              onClick={newModel}
              {...agentAttrs(newModel)}
              className={buttonRecipe({ variant: "primary", size: "sm" }, controlClassName)}
            >
              <AiOutlinePlus /> {l("base.new")}
            </button>
          ) : null}
        </div>
      </div>
      {query ? null : modelDashboard}
      {queryMakerArgs}
      <RenderInsight />
      {view === "card" ? (
        <DataCardList
          slice={slice}
          renderItem={renderItem ?? (() => null)}
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
