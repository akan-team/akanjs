"use client";
import { useScopePath, useSurface } from "use-agentic";
// Through the `"use client"` shim, not `react` — see `StToolBuilder`.
import { useEffect, useRef } from "../hooks";
import { mountFieldTools } from "./fieldTools";

/** Publishes `fill<Model>Form`: a patch over every writable field, gated per field by the controls on screen. */
export const useFormTools = (refName: string | null, write: (action: string, value: unknown) => void) => {
  const surface = useSurface();
  const scope = useScopePath();
  const live = useRef(write);
  live.current = write;
  const scopeKey = scope.join(".");
  useEffect(() => {
    if (!refName) return;
    return mountFieldTools(surface, scope, (build) => build.formEntries(surface, scope, refName, live));
  }, [surface, scopeKey, refName]);
};
