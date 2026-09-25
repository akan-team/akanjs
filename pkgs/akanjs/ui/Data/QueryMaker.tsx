"use client";
import { cn, fetch, usePage } from "akanjs/client";
import { capitalize } from "akanjs/common";
import type { QuerySetting, SliceMeta } from "akanjs/fetch";
import type { SerializedArg } from "akanjs/signal";
import { st } from "akanjs/store";
import { useDebounce } from "akanjs/webkit";
import { useRef, useState } from "react";
import { Select } from "../Select";
import Arg from "../Signal/Arg";
import { dictLabel } from "./dataText";
import RefPicker from "./RefPicker";

interface QueryMakerProps {
  className?: string;
  slice: SliceMeta;
  query?: QuerySetting;
  /** Where a completed filter goes. Defaults to the slice's own store, which is where a listing reads it. */
  onApply?: (setting: ResolvedQuerySetting) => void;
}
export interface QueryMakerState {
  queryKeys: string[];
  args: SerializedArg[];
  setting: ResolvedQuerySetting;
  selectKey: (queryKey: string) => void;
  setArg: (idx: number, value: unknown) => void;
  /** Applies a whole filter at once, for a control that stands for one — a dashboard tile, a saved view. */
  applySetting: (setting: QuerySetting) => void;
}
/** A setting whose thunk has been read, which is the only form the store and the wire accept. */
export interface ResolvedQuerySetting {
  queryKey: string;
  args: unknown[];
}
interface QueryMakerKeyProps {
  className?: string;
  selectClassName?: string;
  slice: SliceMeta;
  state: QueryMakerState;
}
interface QueryMakerArgsProps {
  className?: string;
  slice: SliceMeta;
  state: QueryMakerState;
}

/** A filter's args may be written as a thunk, so that an arg relative to now is read when the filter is applied. */
export const resolveQuerySetting = (setting: QuerySetting): ResolvedQuerySetting => {
  const args = setting.args ?? setting.queryArgs;
  return { queryKey: setting.queryKey, args: typeof args === "function" ? args() : (args ?? []) };
};

// An arg the browser has no input for is one this maker cannot fill, so the filter taking it is not offered.
const isFillableArg = (arg: SerializedArg) => !arg.modelType;
const defaultArg = (arg: SerializedArg) => ((arg.arrDepth ?? 0) > 0 ? [] : null);
// A cleared text input reads back as "" and a cleared list as [] — neither is a value the caller supplied.
const isFilledArg = (value: unknown) =>
  value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && !value.length);
/** A filter the server will accept: every arg it declared as required has been given a value. */
export const isReadyQuery = (args: SerializedArg[], values: unknown[]) =>
  args.every((arg, idx) => arg.nullable || isFilledArg(values[idx]));

/**
 * The filter a listing is showing, and the one write that applies it. Held in a hook rather than a component
 * because the key select rides the toolbar while the args that key takes render under it — two places in the
 * tree, one selection.
 */
export const useQueryMaker = ({ slice, query, onApply }: QueryMakerProps): QueryMakerState => {
  const { refName, sliceName } = slice;
  const storeDo = st.do as unknown as { [key: string]: (...args: unknown[]) => Promise<void> };
  const filterQuery = fetch.filterQueryMap?.get(refName) ?? {};
  const queryKeys = Object.entries(filterQuery)
    .filter(([, args]) => args.every(isFillableArg))
    .map(([queryKey]) => queryKey);
  const [setting, setSetting] = useState<ResolvedQuerySetting>(
    query ? resolveQuerySetting(query) : { queryKey: queryKeys[0] ?? "any", args: [] },
  );
  // Read through a ref: the debounced callback is memoized on the first render, so a caller passing a fresh
  // closure each render would keep getting the very first one.
  const applyRef = useRef<(setting: ResolvedQuerySetting) => void>(() => undefined);
  applyRef.current = (setting) => {
    if (onApply) onApply(setting);
    else void storeDo[`setQueryArgsOf${capitalize(sliceName)}`](setting.queryKey, setting.args);
  };
  // Debounced because a text arg writes on every keystroke, and each write is a round trip.
  const applyQuery = useDebounce((setting: ResolvedQuerySetting) => {
    applyRef.current(setting);
  }, []);
  const update = (setting: ResolvedQuerySetting) => {
    setSetting(setting);
    // Picking a filter that takes a required arg leaves the query incomplete until the arg is typed, and the
    // server refuses an incomplete one. Hold it here rather than firing a request that can only fail.
    if (isReadyQuery(filterQuery[setting.queryKey] ?? [], setting.args)) applyQuery(setting);
  };
  const args = filterQuery[setting.queryKey] ?? [];
  return {
    queryKeys,
    args,
    setting,
    selectKey: (queryKey) => {
      update({ queryKey, args: (filterQuery[queryKey] ?? []).map(defaultArg) });
    },
    setArg: (idx, value) => {
      update({ ...setting, args: args.map((arg, i) => (i === idx ? value : (setting.args[i] ?? defaultArg(arg)))) });
    },
    applySetting: (setting) => {
      update(resolveQuerySetting(setting));
    },
  };
};

/** The filter picker. Sized for a toolbar, beside the sort and page-size selects. */
export const QueryMakerKey = ({ className, selectClassName, slice, state }: QueryMakerKeyProps) => {
  const { l } = usePage();
  const { queryKeys, setting, selectKey } = state;
  if (queryKeys.length < 2) return null;
  return (
    <Select<string>
      className={className}
      selectClassName={selectClassName}
      value={setting.queryKey}
      options={queryKeys.map((queryKey) => ({
        label: dictLabel(l._, `${slice.refName}.query.${queryKey}`, queryKey),
        value: queryKey,
      }))}
      onChange={selectKey}
    />
  );
};

/** What the picked filter asks for. Renders nothing for a filter that takes no arguments. */
export const QueryMakerArgs = ({ className, slice, state }: QueryMakerArgsProps) => {
  const { l } = usePage();
  const { args, setting, setArg } = state;
  if (!args.length) return null;
  return (
    <div className={cn("mb-4 flex w-full flex-col gap-1 rounded-box border border-border p-3", className)}>
      {args.map((arg, idx) => {
        // An id the filter declared against a model is picked from that model, not typed as hex. The picker
        // runs the same maker against the ref's own filters, so a ref of a ref keeps nesting.
        const ref = arg.ref && fetch.slice[arg.ref] ? arg.ref : undefined;
        return (
          <Arg.Query
            key={arg.name}
            endpointKey={setting.queryKey}
            arg={arg}
            label={dictLabel(l._, `${slice.refName}.query.${setting.queryKey}.arg.${arg.name}`, arg.name)}
            value={setting.args[idx] ?? defaultArg(arg)}
            onChange={(value: unknown) => {
              setArg(idx, value);
            }}
            renderScalar={
              ref
                ? (value: string | null, onChange: (value: string | null) => void) => (
                    <RefPicker refName={ref} value={value} onChange={onChange} />
                  )
                : undefined
            }
          />
        );
      })}
    </div>
  );
};

export default function QueryMaker({ className, slice, query, onApply }: QueryMakerProps) {
  const state = useQueryMaker({ slice, query, onApply });
  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <QueryMakerKey className="w-full md:w-72" slice={slice} state={state} />
      <QueryMakerArgs slice={slice} state={state} />
    </div>
  );
}
