"use client";
import { cn } from "akanjs/client";
import { Children, type ReactElement, type ReactNode, useRef } from "react";

import { createOverridable } from "./UiOverride";

export interface RadioProps {
  value: string | number | null;
  className?: string;
  disabled?: boolean;
  children: ReactNode | ReactElement | ReactElement[];
  onChange: (value: string | number | null, idx: number) => void;
}

const DefaultRadio = ({ value, children, disabled, className, onChange }: RadioProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children) as ReactElement<{ value: string | number | null }>[];
  // Index matching is the documented fallback for callers that pass a position, but it only applies when no
  // child owns the value — resolving both at once is what let two options read as checked at the same time.
  const byValue = items.findIndex((child) => child.props?.value === value);
  const checkedIdx = byValue >= 0 ? byValue : typeof value === "number" ? value : -1;

  const move = (from: number, step: number) => {
    const next = (from + step + items.length) % items.length;
    onChange(items[next]?.props?.value ?? null, next);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div className={cn("flex flex-wrap gap-1", className)} ref={ref} role="radiogroup">
      {items.map((child, idx) => {
        const checked = idx === checkedIdx;
        return (
          <button
            aria-checked={checked}
            className={cn(
              "flex items-center gap-2 rounded-field px-2 py-1 text-left transition-colors",
              !disabled && "hover:bg-muted/60",
              disabled && "cursor-not-allowed opacity-50",
            )}
            disabled={disabled}
            key={idx}
            onClick={() => {
              onChange(child.props?.value ?? null, idx);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") move(idx, 1);
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(idx, -1);
              else return;
              event.preventDefault();
            }}
            role="radio"
            tabIndex={checked || (checkedIdx < 0 && idx === 0) ? 0 : -1}
            type="button"
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                checked ? "border-primary" : "border-input",
              )}
            >
              <span
                className={cn("size-2 rounded-full bg-primary transition-transform", checked ? "scale-100" : "scale-0")}
              />
            </span>
            {child}
          </button>
        );
      })}
    </div>
  );
};

export interface ItemProps {
  value: string | number;
  children: ReactNode | ReactElement;
  className?: string;
  checked?: boolean;
  onChange?: (value: string) => void;
}

const DefaultItem = ({ className, children }: ItemProps) => (
  <span className={cn("text-sm", className)}>{children}</span>
);

const RadioBase = createOverridable("Radio", DefaultRadio);

/**
 * Radio group. `Radio` and `Radio.Item` each resolve to a route-scoped override when a
 * `page/**\/_overrides.tsx` in the route's ancestry declares one (slots `Radio`, `RadioItem`).
 */
export const Radio = Object.assign(RadioBase, {
  Item: createOverridable("RadioItem", DefaultItem),
});
