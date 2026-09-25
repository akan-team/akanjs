"use client";
import { Children, type ReactElement, useEffect, useRef } from "react";
import { useScopePath, useSurface } from "./surfaceContext";
import type { ToolConfirm } from "./types";

interface AgenticProps {
  name: string;
  description?: string;
  settle?: boolean;
  confirm?: ToolConfirm;
  children: ReactElement<{ onClick?: () => unknown }>;
}

/**
 * Registers the child's `onClick` as a no-argument tool and renders the child untouched.
 *
 * The first-class path is passing a hook-made tool by reference as the handler itself; this wrapper is for
 * elements whose handler you do not own — third-party components and embeds.
 */
export const Agentic = ({ name, description, settle, confirm, children }: AgenticProps) => {
  const surface = useSurface();
  const scope = useScopePath();
  const child = Children.only(children);
  const live = useRef({ onClick: child.props.onClick, confirm });
  live.current = { onClick: child.props.onClick, confirm };
  const scopeKey = scope.join(".");
  useEffect(() => {
    return surface.registerTool(scope, {
      name,
      description,
      settle,
      ...(confirm === undefined
        ? {}
        : {
            confirm: (args: Record<string, unknown>) => {
              const latest = live.current.confirm;
              return typeof latest === "function" ? latest(args) : (latest ?? false);
            },
          }),
      run: () => live.current.onClick?.(),
    });
  }, [surface, scopeKey, name]);
  return children;
};
