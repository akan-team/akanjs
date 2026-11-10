import { DataList } from "akanjs/base";
import type { DynamicRecord } from "akanjs/common";
import type { BaseInsight, BaseObject } from "akanjs/constant";
import type { LiveEventPayload } from "akanjs/signal";
import { expandQueryArgs, normalizeQueryArgs } from "../fetch/client/sliceQueryArgs";
import { type LiveSortableRow, livePlacementIndex } from "./liveInsert";
import type { SliceListContext } from "./sliceListActions";
import type { SetGet } from "./types";

type Light = BaseObject;
interface Insight {
  count: number;
}

export const sliceLiveActionsOf = (list: SliceListContext) => {
  const { refName, fetch, cnst, keys, slice, namesOfSlice, lastPageFrom } = list;
  // One room per slice, not per component: a second room would apply every event to the one list twice.
  let liveWatch: { signature: string; dispose: () => void } | null = null;
  let liveWatchers = 0;
  let liveClosed: { signature: string; at: Date } | null = null;
  const closeLiveWatch = () => {
    if (!liveWatch) return;
    liveWatch.dispose();
    liveClosed = { signature: liveWatch.signature, at: new Date() };
    liveWatch = null;
  };
  const livePauseIdxs = (slice.live?.pauseOn ?? [])
    .map((name) => slice.args.findIndex((arg) => arg.name === name))
    .filter((idx) => idx >= 0);
  return {
    // Membership was decided server-side; a row is placed only where its position is knowable, else stamped stale.
    [namesOfSlice.applyLiveModel]: function (this: SetGet, event: LiveEventPayload) {
      const currentState = this.get() as { [key: string]: any };
      const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
      const staleAt = { [namesOfSlice.modelStaleAt]: new Date() };
      // The refetch in flight may have read before this event, so it cannot be patched in, only remembered.
      if (event.op === "invalidate" || (currentState[namesOfSlice.modelListLoading] as boolean)) {
        this.set(staleAt);
        return;
      }
      const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
      const limit = currentState[namesOfSlice.limitOfModel] as number;
      const isCumulative = currentState[namesOfSlice.isCumulativeOfModel] as boolean;
      const countedTo = (count: number) => ({
        [namesOfSlice.modelInsight]: new cnst.insight().set({ ...modelInsight, count }),
        ...lastPageFrom(count, limit),
      });
      if (event.op === "leave") {
        if (!modelList.has(event.id)) return;
        this.set({
          [namesOfSlice.modelList]: new DataList(modelList).delete(event.id).save(),
          ...countedTo(Math.max(modelInsight.count - 1, 0)),
          ...staleAt,
        });
        return;
      }
      const light = event.light ? (new cnst.light().set(event.light) as unknown as Light) : null;
      if (event.op === "update") {
        // Not in this window: another page reads the new value when it is fetched.
        if (!light || !modelList.has(event.id)) return;
        this.set({ [namesOfSlice.modelList]: new DataList(modelList).set(light).save() });
        return;
      }
      // A row already in the window is an echo of an applied insert, so the count must not rise twice.
      const placement =
        light && !modelList.has(event.id)
          ? livePlacementIndex({
              list: modelList as unknown as LiveSortableRow[],
              row: light as unknown as LiveSortableRow,
              page: currentState[namesOfSlice.pageOfModel] as number,
              limit,
              count: modelInsight.count,
              cumulative: isCumulative,
              hasMore: currentState[namesOfSlice.hasMoreOfModel] as boolean,
              sortKey: String(currentState[namesOfSlice.sortOfModel]),
              allowedSorts: slice.live?.sort ?? [],
              sorts: fetch.sortValueMap?.get(refName),
            })
          : null;
      if (!light || placement === null) {
        this.set({ ...(modelList.has(event.id) ? {} : countedTo(modelInsight.count + 1)), ...staleAt });
        return;
      }
      // A paged window pushes its last row to the next page; a cumulative or `limit: 0` list keeps every row.
      const inserted = [...modelList.slice(0, placement), light, ...modelList.slice(placement)];
      const placed = isCumulative || !limit ? inserted : inserted.slice(0, limit);
      this.set({
        [namesOfSlice.modelList]: new DataList(placed as Light[]),
        ...countedTo(modelInsight.count + 1),
        ...staleAt,
      });
    },
    // Points this slice's live room at `queryArgs` for one more watcher, or lets one go on null; the last one closes it.
    [namesOfSlice.watchLiveModel]: function (this: SetGet, queryArgs: unknown[] | null) {
      if (!slice.live) return;
      if (!queryArgs) {
        liveWatchers = Math.max(liveWatchers - 1, 0);
        //? A tick later, as StrictMode or a remount lets go and watches again within one commit.
        if (!liveWatchers)
          queueMicrotask(() => {
            if (!liveWatchers) closeLiveWatch();
          });
        return;
      }
      liveWatchers += 1;
      const args = expandQueryArgs(normalizeQueryArgs(queryArgs, slice.args), slice.args);
      // A filled `pauseOn` argument closes the room as null does, until it is cleared.
      const paused = livePauseIdxs.some((idx) => args[idx] != null);
      const signature = paused ? null : JSON.stringify(args);
      if (liveWatch && signature !== liveWatch.signature) closeLiveWatch();
      if (!signature || liveWatch) return;
      const self = this as unknown as DynamicRecord;
      const apply = self[namesOfSlice.applyLiveModel] as (event: unknown) => void;
      const refresh = self[namesOfSlice.refreshModel] as (form: object) => Promise<void>;
      // The generated subscriber serializes room args as the list query does; a hand-built id would not.
      const subscribe = fetch[keys.endpoint.subscribeLive] as ((...args: unknown[]) => () => void) | undefined;
      if (!subscribe) return;
      const dispose = subscribe(...args, (event: unknown) => apply(event), {
        crystalize: false,
        // The events missed while the socket was down are gone, so the list is refetched rather than patched.
        onResync: () => void refresh({ invalidate: true }),
      });
      liveWatch = { signature, dispose };
      // Rows older than the room's last close missed the events sent while it was closed, as on a page shown again.
      const modelInitAt = (this.get() as { [key: string]: any })[namesOfSlice.modelInitAt] as Date;
      if (liveClosed?.signature === signature && modelInitAt < liveClosed.at)
        this.set({ [namesOfSlice.modelStaleAt]: new Date() });
    },
  };
};
