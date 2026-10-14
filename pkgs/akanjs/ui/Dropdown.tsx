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
  useOverlayPortal,
  useOverlayScope,
} from "./overlayLayer";
import { useOverlayPosition } from "./overlayPosition";
import { triggerSlot } from "./triggerSlot";
import { createOverridable, useUiRecipe } from "./UiOverride";

/** Put this on a menu item that runs its own interaction (a switch, a copy button) to keep the menu open. */
export const DROPDOWN_KEEP_OPEN_ATTR = "data-dropdown-keep-open";

// A click into a field (a searchable Select's input) activates no row, and its stopPropagation cannot stop a capture.
const keepOpenSelector = [
  `[${DROPDOWN_KEEP_OPEN_ATTR}]`,
  '[role="combobox"]',
  'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="reset"]):not([type="submit"])',
  "select",
  "textarea",
  '[contenteditable]:not([contenteditable="false"])',
].join(",");

export interface DropdownProps {
  /** Trigger content, drawn inside the framework's own ghost button. */
  value?: ReactNode;
  /** Whole trigger element, drawn instead of that button. The menu's click and aria state land on it. */
  trigger?: ReactNode;
  content: ReactNode;
  className?: string;
  buttonClassName?: string;
  dropdownClassName?: string;
  /** Trigger edge the menu lines up with. Position is computed, so a `left-0` class cannot do this. */
  align?: "start" | "end";
  /** Names this dropdown for the in-page agent; without it the menu publishes nothing. */
  namespace?: string;
}

export const DefaultDropdown = ({
  value,
  trigger,
  content,
  className,
  buttonClassName,
  dropdownClassName,
  align = "end",
  namespace,
}: DropdownProps) => {
  const [opened, setOpened] = useState(false);
  const portal = useOverlayPortal();
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const scope = useOverlayScope(useId());
  const overlayLayerProps = useOverlayLayerProps();
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
  // Annotated with whichever of the two actions the next click performs.
  const toggle = opened ? closeDropdown : openDropdown;
  useEffect(() => {
    if (!opened) return;
    const onMouseDown = (e: MouseEvent) => {
      // A modal a menu item opened, and the menu itself, both portal out of `ref`.
      if (isOwnOverlayClick(e.target, scope)) return;
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
      // Inline: a computed position cannot be a class, and `dropdownClassName` must not lower the stacking order.
      style={{
        position: "fixed",
        zIndex: overlayZ.dropdown,
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? undefined : "hidden",
      }}
      // Capture, because the framework's own item triggers (`Model.Edit`, `Model.Remove`, …) stop the bubbling click.
      onClickCapture={(e) => {
        // A portalled overlay still reaches here through the React tree, whatever the DOM says.
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
  const triggerAttrs = {
    "aria-haspopup": "menu" as const,
    "aria-expanded": opened,
    onClick: () => {
      void toggle();
    },
    ...agentAttrs(toggle),
  };
  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      {trigger ? (
        triggerSlot(trigger, { className: buttonClassName, ...triggerAttrs })
      ) : (
        <button type="button" className={recipe({ variant: "ghost" }, ["flex", buttonClassName])} {...triggerAttrs}>
          {value}
        </button>
      )}
      {/* Mounted while closed: an item declares its agent tool on mount, and unmounting would drop its overlays. */}
      {portal ? createPortal(menu, portal) : null}
    </div>
  );
};

export const Dropdown = createOverridable("Dropdown", DefaultDropdown);
