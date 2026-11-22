"use client";
import { useScopePath, useSurface } from "use-agentic";
import { actionTagOf } from "../actionTag";
// Through the `"use client"` shim, not `react` — see `StToolBuilder`.
import { useEffect, useRef } from "../hooks";
import { mountFieldTools } from "./fieldTools";

export interface FieldToolOptions {
  /** Applied to the agent's write exactly as to the person's typing. */
  transform?: unknown;
  /** While true, nothing is published. */
  disabled?: boolean;
  /** Also publishes `move<Field>On<Model>`, for a list the person can drag. */
  sortable?: boolean;
}

/** Publishes a by-reference setter while its control is usable; `disabled` also closes it to `fill<Model>Form`. */
export const useFieldTool = (onChange: unknown, { transform, disabled, sortable }: FieldToolOptions = {}) => {
  const surface = useSurface();
  const scope = useScopePath();
  const action = actionTagOf(onChange)?.action ?? null;
  const off = !!disabled;
  const live = useRef({ onChange, transform });
  live.current = { onChange, transform };
  const scopeKey = scope.join(".");
  useEffect(() => {
    if (!action || off) return;
    return mountFieldTools(surface, scope, (build) => build.fieldEntries(action, live, !!sortable));
  }, [surface, scopeKey, action, off, !!sortable]);
};

export interface FileFieldSource<T extends { id: string }> {
  /** Read live on every call. Omitted publishes nothing. */
  read?: () => readonly T[];
  label: (file: T) => string;
  /** The list's cap; nothing derives it from the field, so without it the limit is only the server's `Err`. */
  max?: number;
  min?: number;
  disabled?: boolean;
}

/** Lists offered files and sets the field by id; `add`/`sub` are the only way to keep files `read` does not offer. */
export const useFileFieldTool = <T extends { id: string }>(
  onChange: unknown,
  { read, label, max, min, disabled }: FileFieldSource<T>,
) => {
  const surface = useSurface();
  const scope = useScopePath();
  const action = actionTagOf(onChange)?.action ?? null;
  const live = useRef({ onChange, read, label });
  live.current = { onChange, read, label };
  const scopeKey = scope.join(".");
  useEffect(() => {
    if (!action || disabled || !read) return;
    return mountFieldTools(surface, scope, (build) => build.fileEntries(action, live, { max, min }));
  }, [surface, scopeKey, action, disabled, !read, max, min]);
};
