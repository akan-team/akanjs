"use client";
import { cn } from "akanjs/client";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { buttonRecipe } from "./Button";
import { createOverridable, useUiRecipe } from "./UiOverride";

export interface DropdownProps {
  /** Button/trigger content. */
  value: ReactNode;
  /** Dropdown menu content. */
  content: ReactNode;
  /** Additional classes for the dropdown wrapper. */
  className?: string;
  /** Additional classes for the trigger button. */
  buttonClassName?: string;
  /** Additional classes for the dropdown content panel. */
  dropdownClassName?: string;
}

export const DefaultDropdown = ({ value, content, className, buttonClassName, dropdownClassName }: DropdownProps) => {
  const [opened, setOpened] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Route-scoped look swap (recipe slot) — the trigger renders from the same button vocabulary as <Button>.
  const recipe = useUiRecipe("button") ?? buttonRecipe;
  useEffect(() => {
    if (!opened) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpened(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("mousedown", onClick);
    };
  }, [opened]);
  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        className={recipe({ variant: "ghost" }, ["flex", buttonClassName])}
        onClick={() => {
          setOpened((o) => !o);
        }}
      >
        {value}
      </button>
      {opened ? (
        <ul
          onClick={() => {
            setOpened(false);
          }}
          className={cn(
            "absolute right-0 z-[100] mt-1 grid max-h-52 gap-2 overflow-auto whitespace-nowrap rounded-md bg-popover p-1 pr-3 text-popover-foreground shadow-md",
            dropdownClassName,
          )}
        >
          {content}
        </ul>
      ) : null}
    </div>
  );
};

/**
 * Dropdown. Resolves to a route-scoped override when a `page/**\/_overrides.tsx`
 * in the route's ancestry declares one, otherwise renders {@link DefaultDropdown}.
 */
export const Dropdown = createOverridable("Dropdown", DefaultDropdown);
