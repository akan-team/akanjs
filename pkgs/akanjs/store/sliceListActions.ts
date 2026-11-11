import { DataList } from "akanjs/base";
import { type DynamicRecord, type FetchPolicy, isQueryEqual, Logger } from "akanjs/common";
import { type BaseInsight, type BaseObject, MAX_PAGE_SIZE } from "akanjs/constant";
import type { BaseFilterSortKey, FilterInstance } from "akanjs/document";
import type { FetchInitForm } from "akanjs/fetch";
import { expandQueryArgs, normalizeQueryArgs } from "../fetch/client/sliceQueryArgs";
import type { ModelActionContext, SliceEntry } from "./modelActionContext";
import { SliceRequest } from "./SliceRequest";
import type { SetGet } from "./types";

type Input = BaseObject;
type Full = BaseObject;
type Light = BaseObject;
type Filter = FilterInstance;
type Sort = BaseFilterSortKey;
interface Insight {
  count: number;
}

export const sliceListContextOf = (ctx: ModelActionContext, { keys, slice }: SliceEntry) => {
  const { fetch } = ctx;
  // One ticket per slice: every action below writes the same list.
  const requests = new SliceRequest(() => fetch.instance?.http);
  const namesOfSlice = { ...keys.state, ...keys.action };
  // Read off the batch, not the insight count: that is absent under `{ insight: false }` and drifts with live events.
  const hasMoreFrom = (batch: unknown[], askedFor: number) => ({
    [namesOfSlice.hasMoreOfModel]: batch.length >= (askedFor > 0 ? Math.min(askedFor, MAX_PAGE_SIZE) : MAX_PAGE_SIZE),
  });
  // `limit: 0` lists every row on one page.
  const lastPageFrom = (count: number, limit: number) => ({
    [namesOfSlice.lastPageOfModel]: limit > 0 ? Math.max(Math.floor((count - 1) / limit) + 1, 1) : 1,
  });
  const fetchList = (queryArgs: unknown[], skip: number, limit: number, sort: Sort, options?: object) =>
    (fetch[keys.endpoint.list] as (...args: any[]) => Promise<Light[]>)(
      ...expandQueryArgs(queryArgs, slice.args),
      skip,
      limit,
      sort,
      options,
    );
  const fetchInsight = (queryArgs: unknown[], options?: object) =>
    (fetch[keys.endpoint.insight] as (...args: any[]) => Promise<Insight & BaseInsight>)(
      ...expandQueryArgs(queryArgs, slice.args),
      options,
    );
  const insightOf = (modelObjInsight: (Insight & BaseInsight) | null, modelDataList: Light[]) =>
    modelObjInsight ??
    (new ctx.cnst.insight().set({ count: modelDataList.length }) as unknown as Insight & BaseInsight);
  const queryArgsIn = (self: SetGet) =>
    (self.get() as { [key: string]: any })[namesOfSlice.queryArgsOfModel] as object[];
  // A row stamped stale while the request ran may be missing from its rows, so they are read once more, and only once.
  const loadList = async <T>(
    self: SetGet,
    callerSignal: AbortSignal | undefined,
    load: (signal: AbortSignal) => Promise<T>,
    commit: (loaded: T, requestedAt: Date) => object,
  ) => {
    if (callerSignal?.aborted) return requests.endSpent(callerSignal);
    self.set({ [namesOfSlice.modelListLoading]: true });
    const { ticket, signal, dispose, endsQuietly } = requests.claim(callerSignal);
    try {
      for (let round = 0; round < 2; round += 1) {
        // Taken before the request: a write stamped while it runs may be missing from the rows it returns.
        const requestedAt = new Date();
        const queryArgs = queryArgsIn(self);
        const loaded = await load(signal);
        // Arguments seeded meanwhile, as by a `Load.Units` of another page, own the slice now.
        if (!requests.isCurrent(ticket) || queryArgsIn(self) !== queryArgs) return;
        self.set(commit(loaded, requestedAt));
        const staleAt = (self.get() as { [key: string]: any })[namesOfSlice.modelStaleAt] as Date;
        if (staleAt.getTime() <= requestedAt.getTime()) return;
      }
    } catch (error) {
      if (endsQuietly()) return;
      throw error;
    } finally {
      dispose();
      if (requests.isCurrent(ticket)) self.set({ [namesOfSlice.modelListLoading]: false });
    }
  };
  return {
    ...ctx,
    keys,
    slice,
    requests,
    namesOfSlice,
    hasMoreFrom,
    lastPageFrom,
    fetchList,
    fetchInsight,
    insightOf,
    queryArgsIn,
    loadList,
  };
};

export type SliceListContext = ReturnType<typeof sliceListContextOf>;

const freshLoad = Symbol("freshLoad");

export const sliceLoadActionsOf = (list: SliceListContext) => {
  const { cnst, names, slice, namesOfSlice, hasMoreFrom, lastPageFrom, fetchList, fetchInsight, insightOf, loadList } =
    list;
  return {
    [namesOfSlice.initModel]: async function (
      this: SetGet,
      ...args: [...args: any[], initForm: FetchInitForm<Input, Filter> & FetchPolicy]
    ) {
      const initArgLength = Math.min(args.length, slice.args.length);
      const initForm = {
        invalidate: false,
        insight: true,
        ...(args[slice.args.length] ?? {}),
      } as FetchInitForm<Input, Filter> & FetchPolicy;
      const queryArgs = new Array(initArgLength).fill(null).map((_, i) => args[i] as object);
      const defaultModel = new cnst.full().set(initForm.default ?? {}) as unknown as Full;
      if (!initForm.signal?.aborted) this.set({ [names.defaultModel]: defaultModel });
      await ((this as unknown as DynamicRecord)[namesOfSlice.refreshModel] as (...args: any[]) => Promise<void>)({
        ...initForm,
        queryArgs,
        [freshLoad]: true,
      });
    },
    [namesOfSlice.refreshModel]: async function (
      this: SetGet,
      initForm: FetchInitForm<Input, Filter> & FetchPolicy & { queryArgs?: any[]; [freshLoad]?: boolean } = {},
    ) {
      const args = initForm.queryArgs ?? [];
      const refreshArgLength = Math.min(args.length, slice.args.length);
      const currentState = this.get() as { [key: string]: any };
      const existingQueryArgs = currentState[namesOfSlice.queryArgsOfModel] as object[];
      const queryArgs = normalizeQueryArgs(
        [
          ...new Array(refreshArgLength).fill(null).map((_, i) => args[i] as object),
          ...existingQueryArgs.slice(refreshArgLength, slice.args.length),
        ],
        slice.args,
      );
      const {
        default: defaultFromInitForm,
        insight = currentState[namesOfSlice.hasInsightOfModel] as boolean,
        page = currentState[namesOfSlice.pageOfModel] as number,
        limit = currentState[namesOfSlice.limitOfModel] as number,
        sort = currentState[namesOfSlice.sortOfModel] as Sort,
        invalidate = true,
        queryArgs: queryArgsFromInitForm,
        [freshLoad]: fresh = false,
        ...fetchPolicy
      } = initForm;
      const modelOperation = currentState[names.modelOperation] as string;
      const isCumulative = !fresh && (currentState[namesOfSlice.isCumulativeOfModel] as boolean);
      const loadedLength = (currentState[namesOfSlice.modelList] as DataList<Light>).length;
      // A cumulative list refetches every loaded row, or it would collapse back to the first page.
      const fetchLimit = isCumulative ? Math.max(limit, loadedLength) : limit;
      const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
      const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
      const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
      const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
      if (
        !invalidate &&
        !["sleep", "reset"].includes(modelOperation) &&
        isQueryEqual(queryArgs, queryArgsOfModel) &&
        page === pageOfModel &&
        limit === limitOfModel &&
        isQueryEqual(sort as unknown as object, sortOfModel as unknown as object)
      )
        return;
      await loadList(
        this,
        fetchPolicy.signal,
        (signal) =>
          Promise.all([
            fetchList(queryArgs, (page - 1) * limit, fetchLimit, sort, { ...fetchPolicy, signal }),
            insight === false ? null : fetchInsight(queryArgs, { ...fetchPolicy, signal }),
          ]),
        ([modelDataList, modelObjInsight], requestedAt) => {
          const modelList = new DataList(modelDataList);
          const modelInsight = insightOf(modelObjInsight, modelDataList);
          return {
            [namesOfSlice.modelList]: modelList,
            [namesOfSlice.modelInsight]: modelInsight,
            [namesOfSlice.hasInsightOfModel]: insight !== false,
            [namesOfSlice.modelInitList]: modelList,
            [namesOfSlice.modelInitAt]: requestedAt,
            ...lastPageFrom(modelInsight.count, limit),
            ...hasMoreFrom(modelDataList, fetchLimit),
            [namesOfSlice.limitOfModel]: limit,
            [namesOfSlice.queryArgsOfModel]: queryArgs,
            [namesOfSlice.sortOfModel]: sort,
            [namesOfSlice.pageOfModel]: page,
            [names.modelOperation]: "idle",
            ...(fresh ? { [namesOfSlice.isCumulativeOfModel]: false } : {}),
          };
        },
      );
    },
  };
};

export const slicePageActionsOf = (list: SliceListContext) => {
  const { requests, namesOfSlice, hasMoreFrom, lastPageFrom, fetchList, queryArgsIn, loadList } = list;
  return {
    [namesOfSlice.selectModel]: function (
      this: SetGet,
      model: Light | Light[],
      { refresh, remove }: { refresh?: boolean; remove?: boolean } = {},
    ) {
      const models = Array.isArray(model) ? model : [model];
      const currentState = this.get() as { [key: string]: any };
      const modelSelection = currentState[namesOfSlice.modelSelection] as DataList<Light>;
      if (refresh) this.set({ [namesOfSlice.modelSelection]: new DataList(models) });
      else if (remove) {
        const newModelSelection = new DataList(modelSelection);
        models.map((model) => newModelSelection.delete(model.id));
        this.set({ [namesOfSlice.modelSelection]: newModelSelection });
      } else {
        this.set({ [namesOfSlice.modelSelection]: new DataList([...modelSelection.values, ...models]) });
      }
    },
    [namesOfSlice.setPageOfModel]: async function (this: SetGet, page: number, options?: FetchPolicy) {
      const currentState = this.get() as { [key: string]: any };
      const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
      const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
      const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
      const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
      if (pageOfModel === page) return;
      await loadList(
        this,
        options?.signal,
        (signal) =>
          fetchList(queryArgsOfModel, (page - 1) * limitOfModel, limitOfModel, sortOfModel, { ...options, signal }),
        (modelDataList) => ({
          [namesOfSlice.modelList]: new DataList(modelDataList),
          [namesOfSlice.pageOfModel]: page,
          [namesOfSlice.isCumulativeOfModel]: false,
          ...hasMoreFrom(modelDataList, limitOfModel),
        }),
      );
    },
    // Offsets by the rows on screen, not a page, so a live insert cannot shift it. Never raises `ListLoading`
    // (that would drop live events), so concurrent calls may fetch one offset twice; the ticket keeps the newest.
    [namesOfSlice.loadMoreOfModel]: async function (this: SetGet, options?: FetchPolicy) {
      const currentState = this.get() as { [key: string]: any };
      // A refresh in flight owns the spinner; claiming a ticket over it would strand the spinner on.
      if (currentState[namesOfSlice.modelListLoading] as boolean) return;
      if (!(currentState[namesOfSlice.hasMoreOfModel] as boolean)) return;
      const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
      const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
      const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
      const limitOfModel = (currentState[namesOfSlice.limitOfModel] as number) || 20;
      const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
      if (options?.signal?.aborted) return requests.endSpent(options.signal);
      const { ticket, signal, dispose, endsQuietly } = requests.claim(options?.signal);
      const modelDataList = await fetchList(
        queryArgsOfModel,
        (pageOfModel - 1) * limitOfModel + modelList.length,
        limitOfModel,
        sortOfModel,
        { ...options, signal },
      )
        .catch((error: unknown) => {
          if (endsQuietly()) return null;
          throw error;
        })
        .finally(dispose);
      if (!modelDataList || !requests.isCurrent(ticket) || queryArgsIn(this) !== queryArgsOfModel) return;
      // Re-read: a live event may have placed a row meanwhile, and `DataList` collapses the shifted duplicate.
      const currentModelList = (this.get() as { [key: string]: any })[namesOfSlice.modelList] as DataList<Light>;
      this.set({
        [namesOfSlice.modelList]: new DataList([...currentModelList.values, ...modelDataList]),
        [namesOfSlice.isCumulativeOfModel]: true,
        ...hasMoreFrom(modelDataList, limitOfModel),
      });
    },
    [namesOfSlice.setLimitOfModel]: async function (this: SetGet, limit: number, options?: FetchPolicy) {
      const currentState = this.get() as { [key: string]: any };
      const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
      const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
      const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
      const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
      const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
      if (limitOfModel === limit) return;
      const skip = (pageOfModel - 1) * limitOfModel;
      const page = limit > 0 ? Math.max(Math.floor((skip - 1) / limit) + 1, 1) : 1;
      await loadList(
        this,
        options?.signal,
        (signal) => fetchList(queryArgsOfModel, (page - 1) * limit, limit, sortOfModel, { ...options, signal }),
        (modelDataList) => ({
          [namesOfSlice.modelList]: new DataList(modelDataList),
          ...lastPageFrom(modelInsight.count, limit),
          [namesOfSlice.limitOfModel]: limit,
          [namesOfSlice.pageOfModel]: page,
          [namesOfSlice.isCumulativeOfModel]: false,
          ...hasMoreFrom(modelDataList, limit),
        }),
      );
    },
  };
};

export const sliceQueryActionsOf = (list: SliceListContext) => {
  const { slice, namesOfSlice, hasMoreFrom, lastPageFrom, fetchList, fetchInsight, insightOf, loadList } = list;
  return {
    [namesOfSlice.setQueryArgsOfModel]: async function (
      this: SetGet,
      ...args:
        | [...queryArgs: any, options?: FetchPolicy]
        | [setQueryArgs: (...prevQueryArgs: object[]) => object[], options?: FetchPolicy]
    ) {
      const isSetQueryAsFunction = typeof args[0] === "function";
      const currentState = this.get() as { [key: string]: any };
      const options = (isSetQueryAsFunction ? args[1] : args[slice.args.length]) as FetchPolicy | undefined;
      const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
      const queryArgs = normalizeQueryArgs(
        isSetQueryAsFunction
          ? (args[0] as (...prevQueryArgs: object[]) => object[])(...queryArgsOfModel)
          : new Array(slice.args.length).fill(null).map((_, i) => args[i] as object),
        slice.args,
      );
      const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
      const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
      const hasInsightOfModel = currentState[namesOfSlice.hasInsightOfModel] as boolean;
      if (isQueryEqual(queryArgsOfModel, queryArgs)) {
        Logger.trace(`${namesOfSlice.queryArgsOfModel} store-level cache hit`);
        return;
      }
      await loadList(
        this,
        options?.signal,
        (signal) =>
          Promise.all([
            fetchList(queryArgs, 0, limitOfModel, sortOfModel, { ...options, signal }),
            hasInsightOfModel === false ? null : fetchInsight(queryArgs, { ...options, signal }),
          ]),
        ([modelDataList, modelObjInsight]) => {
          const modelInsight = insightOf(modelObjInsight, modelDataList);
          return {
            [namesOfSlice.queryArgsOfModel]: queryArgs,
            [namesOfSlice.modelList]: new DataList(modelDataList),
            [namesOfSlice.modelInsight]: modelInsight,
            ...lastPageFrom(modelInsight.count, limitOfModel),
            [namesOfSlice.pageOfModel]: 1,
            [namesOfSlice.isCumulativeOfModel]: false,
            ...hasMoreFrom(modelDataList, limitOfModel),
            [namesOfSlice.modelSelection]: new Map(),
          };
        },
      );
    },
    [namesOfSlice.setSortOfModel]: async function (this: SetGet, sort: Sort, options?: FetchPolicy) {
      const currentState = this.get() as { [key: string]: any };
      const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
      const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
      const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
      if (sortOfModel === sort) return;
      await loadList(
        this,
        options?.signal,
        (signal) => fetchList(queryArgsOfModel, 0, limitOfModel, sort, { ...options, signal }),
        (modelDataList) => ({
          [namesOfSlice.modelList]: new DataList(modelDataList),
          [namesOfSlice.sortOfModel]: sort,
          [namesOfSlice.pageOfModel]: 1,
          [namesOfSlice.isCumulativeOfModel]: false,
          ...hasMoreFrom(modelDataList, limitOfModel),
        }),
      );
    },
  };
};
