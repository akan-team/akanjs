"use client";
import { cn } from "akanjs/client";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { buttonRecipe } from "./Button";
import { isOwnOverlayClick, OverlayOwnerProvider, useOverlayScope } from "./overlayLayer";
import { createOverridable, useUiRecipe } from "./UiOverride";

/** Put this on a menu item that runs its own interaction (a switch, a copy button) to keep the menu open. */
export const DROPDOWN_KEEP_OPEN_ATTR = "data-dropdown-keep-open";

const keepOpenSelector = `[${DROPDOWN_KEEP_OPEN_ATTR}]`;

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
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scope = useOverlayScope(useId());
  // Route-scoped look swap (recipe slot) — the trigger renders from the same button vocabulary as <Button>.
  const recipe = useUiRecipe("button") ?? buttonRecipe;
  useEffect(() => {
    if (!opened) return;
    const onMouseDown = (e: MouseEvent) => {
      // A menu item may open a Modal, which portals to document.body and so is never inside ref.
      if (isOwnOverlayClick(e.target, scope)) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setOpened(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [opened, scope]);
  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={opened}
        className={recipe({ variant: "ghost" }, ["flex", buttonClassName])}
        onClick={() => {
          setMounted(true);
          setOpened((o) => !o);
        }}
      >
        {value}
      </button>
      {/* Hidden rather than unmounted once opened: unmounting takes any overlay a menu item opened down with it. */}
      {mounted ? (
        <ul
          hidden={!opened}
          onClick={(e) => {
            // A portalled overlay still bubbles here through the React tree, whatever the DOM says.
            if (isOwnOverlayClick(e.target, scope)) return;
            if (e.target instanceof Element && e.target.closest(keepOpenSelector)) return;
            setOpened(false);
          }}
          className={cn(
            "absolute right-0 z-[100] mt-1 grid max-h-52 gap-0.5 overflow-auto whitespace-nowrap rounded-md bg-popover p-1 text-popover-foreground shadow-md",
            dropdownClassName,
            !opened && "hidden",
          )}
        >
          {/* Reaches an overlay this menu opens even after it portals away, so it can claim it as its own. */}
          <OverlayOwnerProvider value={scope}>{content}</OverlayOwnerProvider>
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
