"use client";
import { cn, usePage } from "akanjs/client";
import { formatPhone, isPhoneNumber } from "akanjs/common";
import { useFieldTool } from "akanjs/store";
import { memo } from "react";
import { agentAttrs } from "../agentAttrs";
import { Input } from "../Input";
import { Label } from "./Label";

export const lengthValidator =
  (
    l: (key: string, param?: Record<string, string | number>) => string,
    minlength: number,
    maxlength: number,
    validate?: (text: string) => boolean | string,
  ) =>
  (text: string) =>
    text.length < minlength
      ? l("base.textTooShortError", { minlength })
      : text.length > maxlength
        ? l("base.textTooLongError", { maxlength })
        : (validate?.(text) ?? true);

interface TextFieldProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: string | null;
  onChange: (value: string) => void;
  inputClassName?: string;
  placeholder?: string;
  nullable?: boolean;
  disabled?: boolean;
  transform?: (value: string) => string;
  validate?: (text: string) => boolean | string;
  minlength?: number;
  maxlength?: number;
  onPressEnter?: () => void;
}
export interface TextProps extends TextFieldProps {
  inputStyleType?: "bordered" | "borderless" | "underline";
}
const TextField = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  placeholder,
  nullable,
  disabled,
  minlength = nullable ? 0 : 2,
  maxlength = 200,
  transform = (v) => v,
  validate,
  onPressEnter,
  inputClassName,
  inputStyleType = "bordered",
}: TextProps) => {
  useFieldTool(onChange, { transform, disabled });
  const { l } = usePage();
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Input
        {...agentAttrs(onChange)}
        inputStyleType={inputStyleType}
        value={value ?? ""}
        nullable={nullable}
        placeholder={placeholder}
        onChange={(value) => {
          onChange(transform(value));
        }}
        disabled={disabled}
        className={cn("w-full", "")}
        inputClassName={cn("w-full focus:border-primary", inputClassName)}
        validate={lengthValidator(l, minlength, maxlength, validate)}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};
export const Text = memo(TextField);

export interface TextAreaProps extends TextFieldProps {
  rows?: number;
}
const TextAreaField = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  placeholder,
  nullable,
  disabled,
  rows = 3,
  minlength = nullable ? 0 : 2,
  maxlength = 1000,
  transform = (v) => v,
  validate,
  onPressEnter,
  inputClassName,
}: TextAreaProps) => {
  useFieldTool(onChange, { transform, disabled });
  const { l } = usePage();
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Input.TextArea
        {...agentAttrs(onChange)}
        value={value ?? ""}
        nullable={nullable}
        placeholder={placeholder}
        onChange={(value) => {
          onChange(transform(value));
        }}
        disabled={disabled}
        rows={rows}
        className={cn("h-full w-full")}
        inputClassName={cn("w-full focus:border-primary", inputClassName)}
        validate={lengthValidator(l, minlength, maxlength, validate)}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};
export const TextArea = memo(TextAreaField);

export interface EmailProps extends TextFieldProps {
  inputStyleType?: "bordered" | "borderless" | "underline";
}
export const Email = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  placeholder = "example@email.com",
  nullable,
  disabled,
  minlength = nullable ? 0 : 2,
  maxlength = 80,
  transform = (v) => v,
  validate,
  onPressEnter,
  inputClassName,
  inputStyleType,
}: EmailProps) => {
  useFieldTool(onChange, { transform, disabled });
  const { l } = usePage();
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Input.Email
        {...agentAttrs(onChange)}
        value={value ?? ""}
        nullable={nullable}
        placeholder={placeholder}
        onChange={(value) => {
          onChange(transform(value));
        }}
        disabled={disabled}
        className={cn("w-full", "")}
        inputClassName={cn("w-full focus:border-primary", inputClassName)}
        inputStyleType={inputStyleType}
        validate={lengthValidator(l, minlength, maxlength, validate)}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};

export type PhoneProps = TextFieldProps;
export const Phone = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  placeholder,
  nullable,
  disabled,
  maxlength = 13,
  transform = (v) => formatPhone(v),
  validate,
  onPressEnter,
  inputClassName,
}: PhoneProps) => {
  useFieldTool(onChange, { transform, disabled });
  const { l } = usePage();

  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Input
        {...agentAttrs(onChange)}
        value={value ?? ""}
        nullable={nullable}
        placeholder={placeholder}
        onChange={(value) => {
          onChange(transform(value));
        }}
        disabled={disabled}
        maxLength={maxlength}
        className={cn("w-full", "")}
        inputClassName={cn("w-full focus:border-primary", inputClassName)}
        validate={(text: string) => {
          if (!isPhoneNumber(text)) return l("base.phoneInvalidError");
          else return validate?.(text) ?? true;
        }}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};

export interface PasswordProps extends TextFieldProps {
  confirmValue?: string | null;
  onChangeConfirm?: (value: string) => void;
  showConfirm?: boolean;
}
export const Password = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  confirmValue,
  onChangeConfirm,
  placeholder,
  nullable,
  disabled,
  minlength = nullable ? 0 : 8,
  maxlength = 20,
  transform = (v) => v,
  validate,
  onPressEnter,
  inputClassName,
  showConfirm,
}: PasswordProps) => {
  useFieldTool(onChange, { transform, disabled });
  const { l } = usePage();
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <div className="flex flex-col gap-2">
        <Input.Password
          {...agentAttrs(onChange)}
          value={value ?? ""}
          nullable={nullable}
          placeholder={placeholder ?? l("base.password")}
          onChange={(value) => {
            onChange(transform(value));
          }}
          disabled={disabled}
          className={cn("w-full", "")}
          inputClassName={cn("w-full focus:border-primary", inputClassName)}
          validate={lengthValidator(l, minlength, maxlength, validate)}
          onPressEnter={onPressEnter}
        />
        {showConfirm ? (
          <Input.Password
            value={confirmValue ?? ""}
            nullable={nullable}
            placeholder={l("base.passwordConfirm")}
            onChange={(value) => onChangeConfirm?.(transform(value))}
            disabled={disabled}
            className={cn("w-full", "")}
            inputClassName={cn("w-full focus:border-primary", inputClassName)}
            validate={(text: string) => {
              if (value && text !== value) return l("base.passwordNotMatchError");
              else return true;
            }}
            onPressEnter={onPressEnter}
          />
        ) : null}
      </div>
    </div>
  );
};
