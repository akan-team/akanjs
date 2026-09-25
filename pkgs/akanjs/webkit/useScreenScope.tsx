"use client";
import { useEffect, useRef } from "react";
import { AgenticSurface, useScopePath, useSurface } from "use-agentic";

export interface ScreenScopeItem {
  id: string;
  label?: string;
}

interface ScreenScopeOptions {
  id: string;
  kind: string;
  label?: string;
  items?: () => ScreenScopeItem[];
}

const ITEM_CAP = 100;

/**
 * Announces what a component has on screen: one scope for its mounted lifetime, plus an `<id>.items` resource
 * naming what it currently renders. `Load.Units`/`Load.View` call this, so every list and detail view is visible
 * to the in-page agent with no app code. Items are capped and the cap is declared — a truncated list must never
 * read as the whole one.
 *
 * Opened under the scope it is mounted in, not at the root: a list inside an `Agent.Zone` belongs to that zone's
 * view, and a view only sees keys in its own subtree.
 *
 * Returns the scope path, which the caller puts on the container it renders as `data-agent-scope`: that attribute
 * is how `readScreen({ section })` and `highlight` resolve a path the agent read in the screen context back to the
 * element. A caller that renders no container of its own simply is not addressable that way.
 */
export const useScreenScope = ({ id, kind, label, items }: ScreenScopeOptions) => {
  const surface = useSurface();
  const parent = useScopePath();
  const live = useRef(items);
  live.current = items;
  const parentKey = parent.join(".");
  const path = AgenticSurface.childPath(parent, id).join(".");
  useEffect(() => {
    const closeScope = surface.openScope(parent, { id, kind, label });
    const closeItems = live.current
      ? surface.registerResource(AgenticSurface.childPath(parent, id), {
          name: "items",
          read: () => {
            const list = live.current?.() ?? [];
            return {
              total: list.length,
              items: list.slice(0, ITEM_CAP),
              ...(list.length > ITEM_CAP ? { truncated: true } : {}),
            };
          },
        })
      : null;
    return () => {
      closeItems?.();
      closeScope();
    };
  }, [surface, parentKey, id, kind, label]);
  return path;
};
