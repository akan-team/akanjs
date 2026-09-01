"use client";
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { useScopePath, useSurface } from "./surfaceContext";
import type { JsonSchema } from "./types";

export interface AgentStateMeta<T> {
  description?: string;
  serialize?: (value: T) => unknown;
  report?: boolean;
  /** Schema of the setter's `value` argument. Without it the state is published read-only. */
  set?: JsonSchema;
  /** Validates or coerces the setter's incoming `value` — throw to refuse the write. Nothing else enforces `set`. */
  parse?: (value: unknown) => T;
}

/**
 * `useState` the agent can read — and write only through a named setter tool, and only when `set` declares one.
 * A falsy name keeps the state and publishes nothing, so a conditional surface never changes the hook count.
 */
export const useAgentState = <T>(
  name: string | null,
  initial: T | (() => T),
  meta: AgentStateMeta<T> = {},
): [T, Dispatch<SetStateAction<T>>] => {
  const surface = useSurface();
  const scope = useScopePath();
  const [value, setValue] = useState(initial);
  const live = useRef({ value, meta });
  live.current = { value, meta };
  const scopeKey = scope.join(".");
  useEffect(() => {
    if (!name) return;
    const { meta: declared } = live.current;
    return surface.registerResource(scope, {
      name,
      description: declared.description,
      report: declared.report,
      read: () => {
        const { value: current, meta: currentMeta } = live.current;
        return currentMeta.serialize ? currentMeta.serialize(current) : current;
      },
    });
  }, [surface, scopeKey, name]);
  const writable = !!meta.set;
  useEffect(() => {
    const { meta: declared } = live.current;
    if (!name || !declared.set) return;
    return surface.registerTool(scope, {
      name: `set${name.charAt(0).toUpperCase()}${name.slice(1)}`,
      description: `Set ${name}.${declared.description ? ` ${declared.description}` : ""}`,
      parameters: {
        type: "object",
        properties: { value: declared.set },
        required: ["value"],
        additionalProperties: false,
      },
      run: (args) => {
        const parse = live.current.meta.parse;
        setValue(parse ? parse(args.value) : (args.value as T));
      },
    });
  }, [surface, scopeKey, name, writable]);
  return [value, setValue];
};
