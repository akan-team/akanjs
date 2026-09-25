"use client";
import { clsx } from "akanjs/client";
import { type ReactNode, useState } from "react";

import { createOverridable } from "./UiOverride";

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
  return (
    <div
      onClick={() => {
        setOpened(true);
      }}
      className={clsx("dropdown dropdown-end", className)}
    >
      <label
        tabIndex={0}
        className={clsx("btn flex", buttonClassName)}
        onClick={() => {
          setOpened(true);
        }}
      >
        {value}
      </label>
      <ul
        tabIndex={0}
        onClick={() => {
          if (opened) setOpened(false);
        }}
        className={clsx(
          "md:scrollbar-thin md:scrollbar-thumb-rounded-md md:scrollbar-thumb-gray-300 md:scrollbar-track-transparent z-[100] grid max-h-52 gap-2 overflow-auto whitespace-nowrap rounded-md bg-base-100 pr-3 shadow-sm",
          opened ? "dropdown-content size-fit p-1" : "size-0 overflow-hidden",
          dropdownClassName,
        )}
      >
        {content}
      </ul>
    </div>
  );
};

/**
 * Dropdown. Resolves to a route-scoped override when a `page/**\/_overrides.tsx`
 * in the route's ancestry declares one, otherwise renders {@link DefaultDropdown}.
 */
export const Dropdown = createOverridable("Dropdown", DefaultDropdown);
