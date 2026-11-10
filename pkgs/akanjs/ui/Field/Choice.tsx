"use client";
import { type EnumInstance, isEnum } from "akanjs/base";
import { cn, usePage } from "akanjs/client";
import { useFieldTool } from "akanjs/store";
import { agentAttrs } from "../agentAttrs";
import { Switch as UiSwitch, type SwitchProps as UiSwitchProps } from "../Switch";
import { ToggleSelect as UtilToggleSelect } from "../ToggleSelect";
import { Label } from "./Label";

export interface SwitchProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  inputClassName?: string;
  onDesc?: string;
  offDesc?: string;
  disabled?: boolean;
  variant?: UiSwitchProps["variant"];
}
export const Switch = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  disabled,
  inputClassName,
  onDesc,
  offDesc,
  variant = "primary",
}: SwitchProps) => {
  useFieldTool(onChange, { disabled });
  return (
    <div {...agentAttrs(onChange)} className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} label={label} desc={desc} /> : null}
      <div className="flex items-center gap-2">
        <UiSwitch
          variant={variant}
          disabled={disabled}
          className={inputClassName}
          checked={value ?? false}
          onChange={(checked) => {
            onChange(checked);
          }}
        />
        {(onDesc ?? offDesc) ? <div className="text-info text-sm">{value ? onDesc : offDesc}</div> : null}
      </div>
    </div>
  );
};

export interface ToggleSelectProps<I, Nullable extends boolean> {
  className?: string;
  labelClassName?: string;
  label?: string;
  desc?: string;
  model?: string;
  field?: string;
  items: { label: string; value: I; disabled?: boolean }[] | readonly I[] | I[] | EnumInstance<string, I>;
  value: I | null;
  nullable?: Nullable;
  disabled?: boolean;
  validate?: (value: I) => boolean | string;
  onChange: (value: Nullable extends true ? I | null : I) => void;
  btnClassName?: string;
}
export const ToggleSelect = <I extends string | number | boolean | null, Nullable extends boolean = false>({
  className,
  labelClassName,
  label,
  desc,
  items,
  value,
  validate,
  onChange,
  nullable,
  disabled,
  btnClassName,
}: ToggleSelectProps<I, Nullable>) => {
  useFieldTool(onChange, { disabled });
  const { l } = usePage();
  const isEnumValue = isEnum(items as EnumInstance<string, I>);
  const change = onChange as (value: I | null) => void;
  return (
    <div {...agentAttrs(onChange)} className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <UtilToggleSelect<I | null>
        className="mt-2"
        nullable={!!nullable}
        btnClassName={btnClassName}
        items={
          isEnumValue
            ? ((items as EnumInstance<string, I>).values.map((item) => ({
                label: l._(`${(items as unknown as EnumInstance).refName}.${item}`),
                value: item,
              })) as { label: string; value: I; disabled?: boolean }[])
            : (items as { label: string; value: I; disabled?: boolean }[])
        }
        value={value}
        onChange={(selected) => {
          change(selected);
        }}
        onClear={() => {
          change(null);
        }}
        disabled={disabled}
        validate={(selected) => {
          return selected === null ? true : (validate?.(selected) ?? true);
        }}
      />
    </div>
  );
};

export interface MultiToggleSelectProps<I extends string | number | boolean> {
  className?: string;
  labelClassName?: string;
  label?: string;
  desc?: string;
  items: EnumInstance<string, I> | { label: string; value: I; disabled?: boolean }[] | readonly I[] | I[];
  value: I[] | null;
  disabled?: boolean;
  minlength?: number;
  maxlength?: number;
  validate?: (value: I[]) => boolean | string;
  onChange: (value: I[]) => void;
}
export const MultiToggleSelect = <I extends string | number | boolean>({
  className,
  labelClassName,
  label,
  desc,
  items,
  value,
  minlength,
  maxlength,
  validate,
  onChange,
  disabled,
}: MultiToggleSelectProps<I>) => {
  useFieldTool(onChange, { disabled });
  const { l } = usePage();
  const isEnumValue = isEnum(items as EnumInstance<string, I>);
  return (
    <div {...agentAttrs(onChange)} className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={!minlength} label={label} desc={desc} /> : null}
      <UtilToggleSelect.Multi
        nullable={!minlength}
        items={
          isEnumValue
            ? ((items as EnumInstance<string, I>).values.map((item) => ({
                label: l._(`${(items as unknown as EnumInstance).refName}.${item}`),
                value: item,
              })) as { label: string; value: string; disabled?: boolean }[])
            : (items as { label: string; value: string; disabled?: boolean }[])
        }
        value={(value ?? []) as string[]}
        onChange={(values) => {
          onChange(values as I[]);
        }}
        disabled={disabled}
        validate={(value) => {
          if (minlength && value.length < minlength) return l("base.selectTooShortError", { minlength });
          else if (maxlength && value.length > maxlength) return l("base.selectTooLongError", { maxlength });
          else return validate?.(value as I[]) ?? true;
        }}
      />
    </div>
  );
};
