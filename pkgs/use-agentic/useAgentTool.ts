"use client";
import { useEffect, useRef } from "react";
import { useScopePath, useSurface } from "./surfaceContext";
import type { JsonSchema, ToolConfirm, ToolGuard } from "./types";

export interface AgentToolMeta {
  description?: string;
  parameters?: JsonSchema;
  settle?: boolean;
  confirm?: ToolConfirm;
  guard?: ToolGuard;
}

/**
 * Publishes one tool for as long as the component is mounted.
 *
 * Identity is the scoped name, not the callback — `run`, `guard`, and `confirm` read the latest render through a
 * ref, so there is no dependency array and no stale closure for the agent to hit. `description` and `parameters`
 * are declaration data, read once at mount.
 */
export const useAgentTool = <Args extends Record<string, unknown> = Record<string, unknown>, Result = unknown>(
  name: string,
  meta: AgentToolMeta,
  run: (args: Args) => Result | Promise<Result>,
): ((args?: Args) => Promise<Result>) => {
  const surface = useSurface();
  const scope = useScopePath();
  const live = useRef({ meta, run });
  live.current = { meta, run };
  const call = useRef<((args?: Args) => Promise<Result>) | null>(null);
  if (!call.current) call.current = async (args = {} as Args) => await live.current.run(args);
  const scopeKey = scope.join(".");
  useEffect(() => {
    const { meta: declared } = live.current;
    return surface.registerTool(scope, {
      name,
      description: declared.description,
      parameters: declared.parameters,
      settle: declared.settle,
      ...(declared.confirm === undefined
        ? {}
        : {
            confirm: (args: Record<string, unknown>) => {
              const confirm = live.current.meta.confirm;
              return typeof confirm === "function" ? confirm(args) : (confirm ?? false);
            },
          }),
      ...(declared.guard === undefined
        ? {}
        : { guard: (args: Record<string, unknown>) => live.current.meta.guard?.(args) ?? true }),
      run: (args) => live.current.run(args as Args),
    });
  }, [surface, scopeKey, name]);
  return call.current;
};
