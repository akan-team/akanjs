"use client";
import { useCallback, useSyncExternalStore } from "react";
import { AgenticSurface } from "use-agentic";

export interface ScreenAction {
  name: string;
  description?: string;
  /** The tool's `label` (`st.tool(name, { label })`): what to show a person, in their language. */
  label?: string;
  /** A `remove*` tool, or one that declares `confirm`: ask the person before `run`. */
  needsConfirm: boolean;
  /** Runs the control's own handler, as its click does; refuses as the tool's guard does. */
  run: () => Promise<void>;
}

/**
 * The actions the current screen publishes that need no argument — what a command palette can offer, and exactly
 * what the agent can do here. A person's pick is not recorded as an agent call.
 */
export const useScreenActions = ({ surface = AgenticSurface.shared }: { surface?: AgenticSurface } = {}) => {
  const subscribe = useCallback((listener: () => void) => surface.subscribe(listener), [surface]);
  useSyncExternalStore(
    subscribe,
    () => surface.version,
    () => surface.version,
  );
  return surface
    .snapshot()
    .tools.filter((tool) => {
      const required = tool.parameters?.required;
      return (!Array.isArray(required) || required.length === 0) && !surface.tool(tool.name)?.card;
    })
    .map((tool): ScreenAction => {
      const label = surface.tool(tool.name)?.label?.();
      return {
        name: tool.name,
        ...(tool.description ? { description: tool.description } : {}),
        ...(label ? { label } : {}),
        needsConfirm: tool.needsConfirm,
        run: async () => {
          const entry = surface.tool(tool.name);
          if (!entry || !("run" in entry) || !entry.run) return;
          const verdict = entry.guard?.({}) ?? true;
          if (verdict !== true) throw new Error(verdict);
          await entry.run({});
        },
      };
    });
};
