"use client";
import { clsx } from "akanjs/client";
import type { ReactElement, ReactNode } from "react";

import { createOverridable } from "./UiOverride";

export interface RadioProps {
  value: string | number | null;
  className?: string;
  disabled?: boolean;
  children: ReactNode | ReactElement | ReactElement[];
  onChange: (value: string | number | null, idx: number) => void;
}
const DefaultRadio = ({ value, children, disabled, className, onChange }: RadioProps) => {
  return (
    <div className={clsx(`flex gap-2`, className)}>
      {(children as ReactElement<{ value: string | number | null }>[]).map((child, idx) => {
        return (
          <div className="flex items-center justify-center gap-1" key={idx}>
            <input
              type="radio"
              disabled={disabled}
              className="radio radio-primary radio-sm"
              checked={value === child.props.value || value === idx}
              onChange={() => {
                onChange(child.props.value, idx);
              }}
            />
            <button
              className="bg-transparent"
              onClick={() => {
                onChange(child.props.value, idx);
              }}
            >
              {child}
            </button>
          </div>
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

const DefaultItem = ({ value, className, children }: ItemProps) => {
  return <div className={clsx("", className)}>{children}</div>;
};

const RadioBase = createOverridable("Radio", DefaultRadio);

/**
 * Radio group. `Radio` and `Radio.Item` each resolve to a route-scoped override when a
 * `page/**\/_overrides.tsx` in the route's ancestry declares one (slots `Radio`, `RadioItem`).
 */
export const Radio = Object.assign(RadioBase, {
  Item: createOverridable("RadioItem", DefaultItem),
});
