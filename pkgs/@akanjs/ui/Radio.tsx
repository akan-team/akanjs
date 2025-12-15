"use client";
import { clsx } from "@akanjs/client";
import { ReactElement, ReactNode } from "react";

export interface RadioProps {
  value: string | number | null;
  className?: string;
  disabled?: boolean;
  children: ReactNode | ReactElement | ReactElement[];
  onChange: (value: string | number | null, idx: number) => void;
}
export const Radio = ({ value, children, disabled, className, onChange }: RadioProps) => {
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

const Item = ({ value, className, children }: ItemProps) => {
  return <div className={clsx("", className)}>{children}</div>;
};
Radio.Item = Item;
