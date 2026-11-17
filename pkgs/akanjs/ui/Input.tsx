"use client";
import { cn, usePage } from "akanjs/client";
import { isEmail } from "akanjs/common";
import { useFieldTool } from "akanjs/store";
import React, {
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { agentAttrs } from "./agentAttrs";
import { inputRecipe } from "./recipe";
import { createOverridable, useUiRecipe } from "./UiOverride";

const statusClassOf = (status: string, firstFocus: boolean) =>
  status === "error"
    ? "border-destructive"
    : !firstFocus && status === "warning"
      ? "border-warning"
      : status === "success"
        ? "border-success"
        : "";

const blurOnEscape =
  (
    onPressEnter?: (value: string, event: KeyboardEvent<HTMLInputElement>) => void,
    onPressEscape?: (e: KeyboardEvent<HTMLInputElement>) => void,
  ) =>
  (e: KeyboardEvent<HTMLInputElement>) => {
    if (onPressEnter && e.key === "Enter") onPressEnter(e.currentTarget.value, e);
    if (e.key === "Escape") {
      e.currentTarget.blur();
      onPressEscape?.(e);
    }
  };

const LeadingIcon = ({ icon, className }: { icon: ReactNode; className?: string }) => {
  if (!icon) return null;
  return <div className={cn("absolute inset-y-0 left-4 z-10 flex items-center justify-center", className)}>{icon}</div>;
};

export const invalidMessageOf = (
  skip: unknown,
  result: boolean | string | undefined,
  l: (key: "base.invalidValueError") => string,
) => (skip || result === true ? null : result === false ? l("base.invalidValueError") : result);

export const InvalidMessage = ({ message }: { message: ReactNode }) => {
  if (!message) return null;
  return <div className="absolute -bottom-4 animate-fadeIn text-destructive text-xs">{message}</div>;
};

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  inputStyleType?: "bordered" | "borderless" | "underline";
  inputRef?: RefObject<HTMLInputElement | null>;
  value: string;
  /** Allows an empty value without the warning status. */
  nullable?: boolean;
  icon?: React.ReactNode;
  iconClassName?: string;
  inputClassName?: string;
  inputWrapperClassName?: string;
  onPressEnter?: (value: any, event: KeyboardEvent<HTMLInputElement>) => void;
  /** `true` is valid; `false` or a message string is invalid. */
  validate?: (value: string) => boolean | string;
  onChange?: (value: string, e?: ChangeEvent<HTMLInputElement>) => void;
  /** Called after Escape blurs the input. */
  onPressEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
};
const DefaultInput = ({
  className,
  nullable,
  inputRef,
  value,
  inputStyleType = "bordered",
  icon,
  iconClassName,
  inputClassName,
  inputWrapperClassName,
  onPressEnter,
  onPressEscape,
  onChange,
  validate,
  ...rest
}: InputProps) => {
  useFieldTool(onChange, { disabled: rest.disabled });
  const { l } = usePage();
  const [firstFocus, setFirstFocus] = useState(true);
  const validateResult = validate ? validate(value) : undefined;
  const inputBase = (useUiRecipe("input") ?? inputRecipe)();
  const invalidMessage = invalidMessageOf(!value.length || firstFocus, validateResult, l);
  const inputType = cn(
    inputBase,
    inputStyleType === "borderless"
      ? "border-transparent bg-transparent"
      : inputStyleType === "underline"
        ? "rounded-none border-0 border-b"
        : "",
  );

  return (
    <div className={cn("relative isolate flex items-center", className)}>
      {icon ? <div className={cn("flex items-center justify-center", iconClassName)}>{icon}</div> : null}
      <input
        {...rest}
        {...agentAttrs(onChange)}
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange?.(e.target.value, e);
        }}
        onBlur={(e) => {
          if (firstFocus && value) setFirstFocus(false);
        }}
        onKeyDown={blurOnEscape(onPressEnter, onPressEscape)}
        className={cn(
          "text-foreground outline-hidden duration-300 focus:border-primary focus:outline-hidden",
          inputType,
          inputClassName,
        )}
      />
      <div
        data-validate={!!validateResult}
        className="absolute -bottom-4 whitespace-nowrap text-destructive text-xs duration-300"
      >
        {invalidMessage}
      </div>
    </div>
  );
};

export type TextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "type" | "onChange" | "onPressEnter"
> & {
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  value: string;
  nullable?: boolean;
  inputClassName?: string;
  inputWrapperClassName?: string;
  onPressEnter?: (value: string, event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onChange?: (value: string, e?: ChangeEvent<HTMLTextAreaElement>) => void;
  validate: (value: string) => boolean | string;
  onPressEscape?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
};
const DefaultTextArea = ({
  className,
  nullable,
  inputRef,
  value,
  inputClassName,
  inputWrapperClassName,
  onPressEnter,
  onPressEscape,
  onChange,
  validate,
  ...rest
}: TextAreaProps) => {
  useFieldTool(onChange, { disabled: rest.disabled });
  const { l } = usePage();
  const validateResult = validate(value);
  const textareaBase = (useUiRecipe("input") ?? inputRecipe)({ kind: "area" });
  const [firstFocus, setFirstFocus] = useState(true);
  const status: "error" | "warning" | "success" =
    !nullable && !value.length ? "warning" : validateResult === true ? "success" : "error";
  const invalidMessage = invalidMessageOf(!value.length || firstFocus, validateResult, l);
  const statusClass = statusClassOf(status, firstFocus);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (onPressEnter && e.key === "Enter") onPressEnter(e.currentTarget.value, e);
  };

  return (
    <div className={cn("relative mb-5", className)}>
      <textarea
        {...rest}
        {...agentAttrs(onChange)}
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange?.(e.target.value, e);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          if (firstFocus && value) setFirstFocus(false);
        }}
        className={cn(
          cn(
            textareaBase,
            "resize-none text-foreground outline-hidden duration-300 focus:border-primary focus:outline-hidden",
          ),
          statusClass,
          inputClassName,
        )}
      />
      <InvalidMessage message={invalidMessage} />
    </div>
  );
};

export type PasswordProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type" | "onChange"> & {
  value: string;
  nullable?: boolean;
  icon?: React.ReactNode;
  iconClassName?: string;
  inputClassName?: string;
  inputWrapperClassName?: string;
  onPressEnter?: (value: any, event: KeyboardEvent<HTMLInputElement>) => void;
  onPressEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onChange?: (value: string, e?: ChangeEvent<HTMLInputElement>) => void;
  validate: (value: string) => boolean | string;
};
const DefaultPassword = ({
  className,
  nullable,
  value,
  icon,
  iconClassName,
  inputClassName,
  inputWrapperClassName,
  onPressEnter,
  onPressEscape,
  onChange,
  validate,
  ...rest
}: PasswordProps) => {
  useFieldTool(onChange, { disabled: rest.disabled });
  const { l } = usePage();
  const inputRef = useRef<HTMLInputElement>(null);
  const validateResult = validate(value);
  const [firstFocus, setFirstFocus] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const inputBase = (useUiRecipe("input") ?? inputRecipe)();
  const status: "error" | "warning" | "success" =
    !nullable && !value.length ? "warning" : validateResult === true ? "success" : "error";
  const invalidMessage = invalidMessageOf(!value.length || firstFocus, validateResult, l) ?? "";
  const statusClass = statusClassOf(status, firstFocus);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onPressEnter && e.key === "Enter") onPressEnter(e.currentTarget.value, e);
    if (onPressEscape && e.key === "Escape") onPressEscape(e);
  };

  return (
    <div className={cn("relative isolate pb-2", className)}>
      <div className={cn("relative flex items-center justify-between", inputWrapperClassName)}>
        <LeadingIcon icon={icon} className={iconClassName} />
        <input
          {...rest}
          {...agentAttrs(onChange)}
          type={showPassword ? "text" : "password"}
          ref={inputRef}
          value={value}
          onBlur={(e) => {
            if (firstFocus && value) setFirstFocus(false);
          }}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            onChange?.(e.target.value, e);
          }}
          className={cn(
            inputBase,
            "text-foreground duration-300 focus:border-primary focus:outline-hidden",
            icon && "pl-12",
            statusClass,
            inputClassName,
          )}
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center justify-center">
          <button
            type="button"
            onClick={() => {
              setShowPassword(!showPassword);
            }}
          >
            {showPassword ? <AiOutlineEye /> : <AiOutlineEyeInvisible />}
          </button>
        </div>
      </div>
      <div
        data-validate={!!invalidMessage.length}
        className="h-2 text-destructive text-xs duration-300 data-[validate=false]:opacity-0 data-[validate=true]:opacity-100"
      >
        {invalidMessage}
      </div>
    </div>
  );
};

export type EmailProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type" | "onChange"> & {
  inputStyleType?: "bordered" | "borderless" | "underline";
  value: string;
  nullable?: boolean;
  icon?: React.ReactNode;
  iconClassName?: string;
  inputClassName?: string;
  inputWrapperClassName?: string;
  onPressEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPressEnter?: (value: any, event: KeyboardEvent<HTMLInputElement>) => void;
  onChange?: (value: string, e?: ChangeEvent<HTMLInputElement>) => void;
  validate: (value: string) => boolean | string;
};
const DefaultEmail = ({
  inputStyleType = "bordered",
  className,
  nullable,
  value,
  onPressEnter,
  onPressEscape,
  onChange,
  validate,
  icon,
  iconClassName,
  inputClassName,
  inputWrapperClassName,
  ...rest
}: EmailProps) => {
  useFieldTool(onChange, { disabled: rest.disabled });
  const { l } = usePage();
  const inputRef = useRef<HTMLInputElement>(null);
  const isValidEmail = isEmail(value);
  const inputBase = (useUiRecipe("input") ?? inputRecipe)();
  const [firstFocus, setFirstFocus] = useState(true);
  const validateResult = !isValidEmail ? l("base.emailInvalidError") : validate(value);
  const status: "error" | "warning" | "success" =
    !nullable && !value.length ? "warning" : !isValidEmail ? "error" : validateResult === true ? "success" : "error";
  const invalidMessage = invalidMessageOf(!value.length || firstFocus, validateResult, l);
  const statusClass = statusClassOf(status, firstFocus);
  const inputType = cn(inputBase, inputStyleType === "underline" ? "rounded-none" : "");

  return (
    <div className={cn("relative isolate mb-5", className)}>
      <div className={cn("flex items-center", inputWrapperClassName)}>
        <LeadingIcon icon={icon} className={iconClassName} />
        <input
          {...rest}
          {...agentAttrs(onChange)}
          type="email"
          value={value}
          ref={inputRef}
          onKeyDown={blurOnEscape(onPressEnter, onPressEscape)}
          onBlur={(e) => {
            if (firstFocus && value) setFirstFocus(false);
          }}
          onChange={(e) => {
            onChange?.(e.target.value, e);
          }}
          className={cn(
            "text-foreground outline-hidden duration-300 focus:border-primary focus:outline-hidden",
            icon && "pl-12",
            inputType,
            statusClass,
            inputClassName,
          )}
        />
      </div>
      <InvalidMessage message={invalidMessage} />
    </div>
  );
};

// A formatter adds separators and units: keep the digits, the first decimal point, and a leading minus.
const parseTypedNumber = (text: string) => {
  const kept = text.replace(/[^\d.-]/g, "");
  const [whole = "", ...fraction] = kept.replace(/-/g, "").split(".");
  return parseFloat(`${kept.startsWith("-") ? "-" : ""}${whole}${fraction.length ? `.${fraction.join("")}` : ""}`);
};

export type NumberProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type" | "onChange"> & {
  value: number | null;
  nullable?: boolean;
  icon?: React.ReactNode;
  iconClassName?: string;
  inputClassName?: string;
  inputWrapperClassName?: string;
  onPressEnter?: (value: any, event: KeyboardEvent<HTMLInputElement>) => void;
  onPressEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
  validate?: (value: number | null) => boolean | string;
  onChange: (value: number | null, e?: ChangeEvent<HTMLInputElement>) => void;
  numberFormat?: boolean;
  format?: (value: number) => string;
  formatter?: (value: string) => string;
  parser?: (value: string) => string;
};
const DefaultNumber = ({
  className,
  nullable,
  value,
  icon,
  iconClassName,
  inputClassName,
  inputWrapperClassName,
  numberFormat,
  onPressEnter,
  onPressEscape,
  validate,
  onChange,
  formatter,
  parser,
  ...rest
}: NumberProps) => {
  useFieldTool(onChange, { disabled: rest.disabled });
  const { l } = usePage();
  const inputRef = useRef<HTMLInputElement>(null);
  const validateResult = validate ? validate(value) : undefined;
  const inputBase = (useUiRecipe("input") ?? inputRecipe)();
  const generateFormat = () => {
    return Number.isNaN(value ?? 0) ? "" : formatter ? formatter(value?.toString() ?? "") : (value?.toString() ?? "");
  };

  const [firstFocus, setFirstFocus] = useState(true);
  const [formatValue, setFormatValue] = useState<string>(generateFormat());

  const status: "error" | "warning" | "success" | "" =
    validate !== undefined
      ? validateResult === true
        ? "success"
        : "error"
      : !nullable && value === null
        ? "warning"
        : "";
  const invalidMessage = invalidMessageOf(value === null, validateResult, l);
  const statusClass = validate !== undefined ? statusClassOf(status, firstFocus) : "";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" && e.key !== "Escape") return;
    const numberValue = parseTypedNumber(e.currentTarget.value);
    if (Number.isNaN(numberValue)) {
      e.currentTarget.value = "";
      setFormatValue("");
      onChange(null);
      return;
    }
    const bound =
      rest.max !== undefined && numberValue > parseFloat(rest.max as string)
        ? rest.max
        : rest.min !== undefined && numberValue < parseFloat(rest.min as string)
          ? rest.min
          : undefined;
    const boundValue = bound === undefined ? undefined : formatter ? formatter(String(bound)) : String(bound);
    if (e.key === "Escape") {
      if (boundValue !== undefined) e.currentTarget.value = boundValue;
      e.currentTarget.blur();
      onPressEscape?.(e);
    } else if (boundValue !== undefined) {
      e.currentTarget.value = boundValue;
      setFormatValue(boundValue);
      onPressEnter?.(parseFloat(boundValue), e);
    } else {
      setFormatValue(formatter ? formatter(String(numberValue)) : String(numberValue));
      onPressEnter?.(numberValue, e);
    }
  };

  useEffect(() => {
    setFormatValue(generateFormat());
  }, [value]);

  return (
    <div className={cn("relative isolate", className)}>
      <div className={cn("flex items-center", inputWrapperClassName)}>
        <LeadingIcon icon={icon} className={iconClassName} />
        <input
          {...rest}
          {...agentAttrs(onChange)}
          ref={inputRef}
          value={formatValue}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            if (firstFocus && value) setFirstFocus(false);
          }}
          onChange={(e) => {
            const parsedValue = parser ? parser(e.target.value) : e.target.value;
            setFormatValue(formatter ? formatter(parsedValue) : e.target.value);
            onChange(parser ? parseFloat(parsedValue) : parseFloat(e.target.value), e);
          }}
          className={cn(
            inputBase,
            "text-foreground duration-300 focus:border-primary focus:outline-hidden",
            icon && "pl-12",
            statusClass,
            inputClassName,
          )}
        />
      </div>

      <InvalidMessage message={invalidMessage} />
    </div>
  );
};

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  className?: string;
  checked: boolean;
  onChange: (checked: boolean, e: ChangeEvent<HTMLInputElement>) => void;
};

const DefaultCheckbox = ({ checked, onChange, className, ...rest }: CheckboxProps) => {
  useFieldTool(onChange, { disabled: rest.disabled });
  return (
    <input
      {...rest}
      {...agentAttrs(onChange)}
      type="checkbox"
      checked={checked}
      // Native with `accent-color`: the browser keeps the focus ring, keyboard toggle and indeterminate state.
      className={cn("size-5 accent-primary", className)}
      onChange={(e) => {
        onChange(e.target.checked, e);
      }}
    />
  );
};
const InputBase = createOverridable("Input", DefaultInput);

export const Input = Object.assign(InputBase, {
  TextArea: createOverridable("InputTextArea", DefaultTextArea),
  Password: createOverridable("InputPassword", DefaultPassword),
  Email: createOverridable("InputEmail", DefaultEmail),
  Number: createOverridable("InputNumber", DefaultNumber),
  Checkbox: createOverridable("InputCheckbox", DefaultCheckbox),
});
