"use client";
import { cn, usePage } from "akanjs/client";
import { type ComponentType, createElement } from "react";

import { buttonRecipe } from "./Button";
import { createOverridable, useUiOverride, useUiRecipe } from "./UiOverride";

/** Toggle-select cell: outline button (recipe slot), filled primary when selected. */
const selectedCls = "border-transparent bg-primary text-primary-foreground hover:bg-primary/90";

export interface ToggleSelectProps<I extends string | number | boolean | null> {
  className?: string;
  btnClassName?: string;
  items: string[] | number[] | { label: string; value: I; disabled?: boolean }[];
  value: I;
  nullable: boolean;
  validate: (value: I) => boolean | string;
  onChange: (value: I, idx: number) => void;
  onClear?: () => void;
  disabled?: boolean;
}
const DefaultToggleSelect = <I extends string | number | boolean | null>({
  className,
  btnClassName,
  items,
  nullable,
  validate,
  value,
  onChange,
  onClear,
  disabled,
}: ToggleSelectProps<I>) => {
  const { l } = usePage();
  const toggleBtn = (useUiRecipe("button") ?? buttonRecipe)({ variant: "outline", size: "sm" });
  const validateResult = value !== null ? validate(value) : false;
  const invalidMessage =
    value === null || (typeof value === "string" && !value.length) || validateResult === true
      ? null
      : validateResult === false
        ? l("base.invalidValueError")
        : validateResult;
  const options = items.map(
    (item) =>
      (typeof item === "string" || typeof item === "number" ? { label: item.toString(), value: item } : item) as {
        label: string;
        value: I;
        disabled?: boolean;
      },
  );
  return (
    <div
      className={cn(
        "relative flex w-full flex-wrap items-center gap-1 rounded-box border border-border p-2",
        className,
      )}
    >
      {options.map((option, idx: number) => {
        const isSelected = value === option.value;
        const isDisabled = (disabled ?? false) || (option.disabled ?? false);
        return (
          <button
            key={idx}
            disabled={isDisabled}
            className={cn(toggleBtn, isSelected && selectedCls, isDisabled && "cursor-not-allowed", btnClassName)}
            onClick={() => {
              if (nullable && isSelected) onClear?.();
              else onChange(option.value, idx);
            }}
          >
            {option.label}
          </button>
        );
      })}
      {invalidMessage ? (
        <div className="absolute -bottom-4 animate-fadeIn text-destructive text-xs">{invalidMessage}</div>
      ) : null}
    </div>
  );
};

export interface MultiProps {
  className?: string;
  btnClassName?: string;
  items: string[] | number[] | { label: string; value: string | number; disabled?: boolean }[];
  value: string[] | number[];
  nullable: boolean;
  validate: (value: string[] | number[]) => boolean | string;
  onChange: (value: string[] | number[]) => void;
  disabled?: boolean;
}
const DefaultMulti = ({
  className,
  btnClassName,
  items,
  nullable,
  validate,
  value,
  onChange,
  disabled,
}: MultiProps) => {
  const { l } = usePage();
  const toggleBtn = (useUiRecipe("button") ?? buttonRecipe)({ variant: "outline", size: "sm" });
  const validateResult = validate(value);
  const invalidMessage =
    !value.length || validateResult === true
      ? null
      : validateResult === false
        ? l("base.invalidValueError")
        : validateResult;
  const options = items.map(
    (item) =>
      (typeof item === "string" || typeof item === "number" ? { label: item.toString(), value: item } : item) as {
        label: string;
        value: string | number;
        disabled?: boolean;
      },
  );
  return (
    <div
      className={cn(
        "relative flex w-full flex-wrap items-center gap-1 rounded-box border border-border p-2",
        className,
      )}
    >
      {options.map((option, idx) => {
        const isSelected = (value as string[]).includes(option.value as string);
        const isDisabled = (disabled ?? false) || (option.disabled ?? false);
        return (
          <button
            key={idx}
            disabled={isDisabled}
            className={cn(toggleBtn, isSelected && selectedCls, isDisabled && "cursor-not-allowed", btnClassName)}
            onClick={() => {
              onChange(
                isSelected
                  ? (value.filter((i) => i !== option.value) as string[])
                  : ([...value, option.value].sort(
                      (a, b) =>
                        options.findIndex((o) => o.value === a) -
                        items.findIndex((o) => (o as { label: string; value: string }).value === b),
                    ) as string[]),
              );
            }}
          >
            {option.label}
          </button>
        );
      })}
      {invalidMessage ? (
        <div className="absolute -bottom-4 animate-fadeIn text-destructive text-xs">{invalidMessage}</div>
      ) : null}
    </div>
  );
};
const ToggleSelectBase = <I extends string | number | boolean | null>(props: ToggleSelectProps<I>) => {
  const Override = useUiOverride("ToggleSelect");
  const Impl = (Override ?? DefaultToggleSelect) as unknown as ComponentType<ToggleSelectProps<I>>;
  return createElement(Impl, props);
};

/**
 * Toggle-select. `ToggleSelect` keeps its generic signature (so `<ToggleSelect<Status> …/>` still
 * infers), and both it and `ToggleSelect.Multi` resolve to a route-scoped override when a
 * `page/**\/_overrides.tsx` in the route's ancestry declares one (slots `ToggleSelect`, `ToggleSelectMulti`).
 */
export const ToggleSelect = Object.assign(ToggleSelectBase, {
  Multi: createOverridable("ToggleSelectMulti", DefaultMulti),
});
