"use client";
import { cn } from "akanjs/client";
import { capitalize } from "akanjs/common";
import { st } from "akanjs/store";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { agentAttrs } from "./agentAttrs";
import { buttonRecipe } from "./Button";
import {
  isOwnOverlayClick,
  OverlayOwnerProvider,
  overlayZ,
  useOverlayLayerProps,
  useOverlayScope,
} from "./overlayLayer";
import { useOverlayPosition } from "./overlayPosition";
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
  /** Trigger edge the menu lines up with. Position is computed, so a `left-0` class cannot do this. */
  align?: "start" | "end";
  /** Names this dropdown for the in-page agent. Without it the menu publishes nothing — two on one screen would share a name. */
  namespace?: string;
}

export const DefaultDropdown = ({
  value,
  content,
  className,
  buttonClassName,
  dropdownClassName,
  align = "end",
  namespace,
}: DropdownProps) => {
  const [opened, setOpened] = useState(false);
  // Resolved in an effect rather than at render: the first client pass has to match the server's, which
  // portalled nothing.
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const scope = useOverlayScope(useId());
  // Read through the portal-to-be: whichever dismissable scope rendered this menu owns it.
  const overlayLayerProps = useOverlayLayerProps();
  // Route-scoped look swap (recipe slot) — the trigger renders from the same button vocabulary as <Button>.
  const recipe = useUiRecipe("button") ?? buttonRecipe;
  const position = useOverlayPosition({ opened, triggerRef: ref, panelRef: menuRef, align });
  const suffix = namespace ? capitalize(namespace) : "";
  st.expose(namespace ? `dropdownIn${suffix}` : null, Boolean)
    .desc("Whether this dropdown menu is showing.")
    .value(opened);
  const openDropdown = st
    .tool(namespace ? `openDropdownIn${suffix}` : null)
    .desc(`Open the ${namespace ?? ""} dropdown menu.`)
    .exec(() => {
      setOpened(true);
    });
  const closeDropdown = st
    .tool(namespace ? `closeDropdownIn${suffix}` : null)
    .desc(`Close the ${namespace ?? ""} dropdown menu.`)
    .exec(() => {
      setOpened(false);
    });
  // One button for both states, so it dispatches — and annotates — whichever of the two the next click performs.
  const toggle = opened ? closeDropdown : openDropdown;
  useEffect(() => {
    setPortal(document.body);
  }, []);
  useEffect(() => {
    if (!opened) return;
    const onMouseDown = (e: MouseEvent) => {
      // A menu item may open a Modal, which portals to document.body and so is never inside ref.
      if (isOwnOverlayClick(e.target, scope)) return;
      // The menu portals out too, so the trigger's own subtree is no longer the whole of "inside".
      if (menuRef.current?.contains(e.target as Node)) return;
      if (ref.current && !ref.current.contains(e.target as Node)) setOpened(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [opened, scope]);
  const menu = (
    <ul
      ref={menuRef}
      {...overlayLayerProps}
      hidden={!opened}
      // Inline, because a computed position cannot be a class — and so a caller's `dropdownClassName`
      // cannot lower the stacking order out from under a modal it is opened over.
      style={{
        position: "fixed",
        zIndex: overlayZ.dropdown,
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? undefined : "hidden",
      }}
      onClick={(e) => {
        // A portalled overlay still bubbles here through the React tree, whatever the DOM says.
        if (isOwnOverlayClick(e.target, scope)) return;
        if (e.target instanceof Element && e.target.closest(keepOpenSelector)) return;
        setOpened(false);
      }}
      className={cn(
        "scrollbar-thin grid max-h-52 min-w-40 gap-0.5 overflow-auto whitespace-nowrap rounded-box border border-border bg-popover p-1 text-popover-foreground shadow-lg",
        dropdownClassName,
        !opened && "hidden",
      )}
    >
      {/* Reaches an overlay this menu opens even after it portals away, so it can claim it as its own. */}
      <OverlayOwnerProvider value={scope}>{content}</OverlayOwnerProvider>
    </ul>
  );
  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={opened}
        className={recipe({ variant: "ghost" }, ["flex", buttonClassName])}
        onClick={toggle}
        {...agentAttrs(toggle)}
      >
        {value}
      </button>
      {/* Mounted from the first render and hidden while closed: a menu item declares its tool on mount, so an
          unmounted menu publishes nothing an agent could find — and unmounting an open one takes any overlay
          a menu item opened down with it. */}
      {portal ? createPortal(menu, portal) : null}
    </div>
  );
};

/**
 * Dropdown. Resolves to a route-scoped override when a `page/**\/_overrides.tsx`
 * in the route's ancestry declares one, otherwise renders {@link DefaultDropdown}.
 */
export const Dropdown = createOverridable("Dropdown", DefaultDropdown);
