"use client";
import type { DataList } from "akanjs/base";
import { useScopePath, useSurface } from "use-agentic";
import { actionTagOf } from "../actionTag";
// Through the `"use client"` shim, not `react` — see `StToolBuilder`.
import { useEffect, useRef } from "../hooks";
import { mountFieldTools } from "./fieldTools";

export interface RelationFieldSource<T extends { id: string }> {
  /** Read live from the store rather than closed over: `load` below changes the list mid-call. */
  read: () => DataList<T>;
  load: () => Promise<unknown> | unknown;
  label: (model: T) => string;
  disabled?: boolean;
}

/** A relation picker's two tools: list the pickable documents (loading them first), then set by id. */
export const useRelationFieldTool = <T extends { id: string }>(
  onChange: unknown,
  { read, load, label, disabled }: RelationFieldSource<T>,
) => {
  const surface = useSurface();
  const scope = useScopePath();
  const action = actionTagOf(onChange)?.action ?? null;
  const live = useRef({ onChange, read, load, label });
  live.current = { onChange, read, load, label };
  const scopeKey = scope.join(".");
  useEffect(() => {
    if (!action || disabled) return;
    return mountFieldTools(surface, scope, (build) => build.relationEntries(action, live));
  }, [surface, scopeKey, action, disabled]);
};
