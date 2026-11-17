"use client";
import { DataList } from "akanjs/base";
import { fetch } from "akanjs/client";
import { isQueryEqual, lowerlize } from "akanjs/common";
import type { SliceMeta } from "akanjs/fetch";
import { useRef, useState } from "react";
import { sliceNamesOf } from "../sliceNamesOf";

export interface RelationWindowQuery {
  queryArgs: unknown[];
  limit: number;
  sort: string;
}

interface WindowHold<Light extends { id: string }> {
  list: DataList<Light>;
  query: RelationWindowQuery | null;
  request: Promise<void> | null;
}

// A field's own page of options, kept off the slice's store keys: the page's listing reads `<model>List`,
// `limitOf<Model>` and `sortOf<Model>`, so a field writing its window there would re-window that listing too.
export const useRelationWindow = <Light extends { id: string }>(slice: SliceMeta) => {
  const { namesOfSlice } = sliceNamesOf(lowerlize(slice.refName), slice.sliceName);
  const [list, setList] = useState(() => new DataList<Light>());
  const [loading, setLoading] = useState(false);
  const hold = useRef<WindowHold<Light>>({ list, query: null, request: null });

  const load = (query: RelationWindowQuery) => {
    const current = hold.current;
    if (current.query && current.request && isQueryEqual(current.query, query)) return current.request;
    const listFn = (fetch as unknown as { [key: string]: (...args: unknown[]) => Promise<Light[]> })[
      namesOfSlice.modelList
    ];
    const args = Array.from({ length: slice.argLength }, (_, idx) => query.queryArgs[idx]);
    setLoading(true);
    const request: Promise<void> = listFn(...args, 0, query.limit, query.sort)
      .then((rows) => {
        if (hold.current.request !== request) return;
        hold.current.list = new DataList(rows);
        setList(hold.current.list);
      })
      .catch((error: unknown) => {
        // Forgotten, so the next open asks again rather than answering from a window that never arrived.
        if (hold.current.request === request) hold.current.query = null;
        throw error;
      })
      .finally(() => {
        if (hold.current.request === request) setLoading(false);
      });
    hold.current.query = query;
    hold.current.request = request;
    return request;
  };

  return { list, loading, load, read: () => hold.current.list };
};
