"use client";
import { clsx, usePage } from "@akanjs/client";
import { isEmail } from "@akanjs/common";
import React, {
  ChangeEvent,
  InputHTMLAttributes,
  KeyboardEvent,
  RefObject,
  TextareaHTMLAttributes,
  useEffect,
  useRef,
  useState,
} from "react";
import { AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  inputStyleType?: "bordered" | "borderless" | "underline";
  inputRef?: RefObject<HTMLInputElement | null>;
  value: string;
  nullable?: boolean;
  cacheKey?: string;
  icon?: React.ReactNode;
  iconClassName?: string;
  inputClassName?: string;
  inputWrapperClassName?: string;
  onPressEnter?: (value: any, event: KeyboardEvent<HTMLInputElement>) => void;
  validate?: (value: string) => boolean | string;
  onChange?: (value: string, e?: ChangeEvent<HTMLInputElement>) => void;
  onPressEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
};
export const Input = ({
  className,
  nullable,
  inputRef,
  value,
  cacheKey,
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
  const { l } = usePage();
  const [firstFocus, setFirstFocus] = useState(true);
  const validateResult = validate ? validate(value) : undefined;
  const status: "error" | "warning" | "success" | null =
    !nullable && !value ? null : !value.length ? "warning" : validateResult === true ? "success" : "error";
  const invalidMessage =
    (value && !value.length) || validateResult === true || firstFocus
      ? null
      : validateResult === false
        ? l("base.invalidValueError")
        : validateResult;
  // const invalidMessage = l("base.invalidValueError");
  const statusClass =
    inputStyleType === "bordered"
      ? status === "error"
        ? "input-error"
        : !firstFocus && status === "warning"
          ? "input-warning"
          : status === "success"
            ? "input-success"
            : ""
      : "";
  const inputType =
    inputStyleType === "bordered"
      ? "input"
      : inputStyleType === "borderless"
        ? "input-ghost"
        : "border-0  border-b rounded-none";
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onPressEnter && e.key === "Enter") onPressEnter(e.currentTarget.value, e);
    if (e.key === "Escape") {
      e.currentTarget.blur();

      onPressEscape?.(e);
    }
  };

  useEffect(() => {
    if (!cacheKey) return;
    sessionStorage.setItem(cacheKey, value);
  }, [value]);

  return (
    <div className={clsx("relative isolate flex items-center", className)}>
      {icon ? <div className={clsx("flex items-center justify-center", iconClassName)}>{icon}</div> : null}
      <input
        {...rest}
        ref={inputRef}
        value={value}
        onChange={(e) => {
          if (cacheKey) {
            sessionStorage.setItem(cacheKey, e.target.value);
          }
          onChange?.(e.target.value, e);
        }}
        onBlur={(e) => {
          if (firstFocus && value) setFirstFocus(false);
        }}
        onKeyDown={handleKeyDown}
        className={clsx(
          `b-5 focus:border-primary text-base-content outline-hidden duration-300 focus:outline-hidden ${icon && ""}`,
          inputType,
          // statusClass,
          inputClassName
        )}
      />
      <div
        data-validate={!!validateResult}
        className="text-error absolute -bottom-4 text-xs whitespace-nowrap duration-300"
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
  cacheKey?: string;
  onPressEnter?: (value: string, event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onChange?: (value: string, e?: ChangeEvent<HTMLTextAreaElement>) => void;
  validate: (value: string) => boolean | string;
  onPressEscape?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
};
const TextArea = ({
  className,
  nullable,
  value,
  inputClassName,
  inputWrapperClassName,
  cacheKey,
  onPressEnter,
  onPressEscape,
  onChange,
  validate,
  ...rest
}: TextAreaProps) => {
  const { l } = usePage();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const validateResult = validate(value);
  const [firstFocus, setFirstFocus] = useState(true);
  const status: "error" | "warning" | "success" =
    !nullable && !value.length ? "warning" : validateResult === true ? "success" : "error";
  const invalidMessage =
    !value.length || validateResult === true || firstFocus
      ? null
      : validateResult === false
        ? l("base.invalidValueError")
        : validateResult;
  const statusClass =
    status === "error"
      ? "textarea-error"
      : !firstFocus && status === "warning"
        ? "textarea-warning"
        : status === "success"
          ? "textarea-success"
          : "";
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (onPressEnter && e.key === "Enter") onPressEnter(e.currentTarget.value, e);
  };

  useEffect(() => {
    if (!cacheKey) return;
    const value = sessionStorage.getItem(cacheKey);
    if (value) {
      onChange?.(value);
    }
  }, []);

  return (
    <div className={clsx("relative mb-5", className)}>
      <textarea
        {...rest}
        ref={inputRef}
        value={value}
        onChange={(e) => {
          if (cacheKey) {
            sessionStorage.setItem(cacheKey, e.target.value);
          }
          onChange?.(e.target.value, e);
        }}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          if (firstFocus && value) setFirstFocus(false);
        }}
        className={clsx(
          `textarea textarea-bordered focus:border-primary text-base-content resize-none outline-hidden duration-300 focus:outline-hidden`,
          statusClass,
          inputClassName
        )}
      />
      {invalidMessage ? (
        <div className="text-error animate-fadeIn absolute -bottom-4 text-xs">{invalidMessage}</div>
      ) : null}
    </div>
  );
};
Input.TextArea = TextArea;

export type PasswordProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type" | "onChange"> & {
  value: string;
  nullable?: boolean;
  icon?: React.ReactNode;
  iconClassName?: string;
  inputClassName?: string;
  inputWrapperClassName?: string;
  cacheKey?: string;
  onPressEnter?: (value: any, event: KeyboardEvent<HTMLInputElement>) => void;
  onPressEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onChange?: (value: string, e?: ChangeEvent<HTMLInputElement>) => void;
  validate: (value: string) => boolean | string;
};
const Password = ({
  className,
  nullable,
  value,
  icon,
  iconClassName,
  inputClassName,
  inputWrapperClassName,
  cacheKey,
  onPressEnter,
  onPressEscape,
  onChange,
  validate,
  ...rest
}: PasswordProps) => {
  const { l } = usePage();
  const inputRef = useRef<HTMLInputElement>(null);
  const validateResult = validate(value);
  const [firstFocus, setFirstFocus] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const status: "error" | "warning" | "success" =
    !nullable && !value.length ? "warning" : validateResult === true ? "success" : "error";
  const invalidMessage =
    !value.length || validateResult === true || firstFocus
      ? ""
      : validateResult === false
        ? l("base.invalidValueError")
        : validateResult;
  const statusClass =
    status === "error"
      ? "input-error"
      : !firstFocus && status === "warning"
        ? "input-warning"
        : status === "success"
          ? "input-success"
          : "";
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onPressEnter && e.key === "Enter") onPressEnter(e.currentTarget.value, e);
    if (onPressEscape && e.key === "Escape") onPressEscape(e);
  };

  useEffect(() => {
    if (!cacheKey) return;
    const value = sessionStorage.getItem(cacheKey);
    if (value) {
      onChange?.(value);
    }
  }, []);
  return (
    <div className={clsx("relative isolate pb-2", className)}>
      <div className={clsx("relative flex items-center justify-between", inputWrapperClassName)}>
        {icon ? (
          <div className={clsx("absolute inset-y-0 left-4 z-10 flex items-center justify-center", iconClassName)}>
            {icon}
          </div>
        ) : null}
        <input
          {...rest}
          type={showPassword ? "text" : "password"}
          ref={inputRef}
          value={value}
          onBlur={(e) => {
            if (firstFocus && value) setFirstFocus(false);
          }}
          onKeyDown={handleKeyDown}
          onChange={(e) => {
            if (cacheKey) {
              sessionStorage.setItem(cacheKey, e.target.value);
            }
            onChange?.(e.target.value, e);
          }}
          className={clsx(
            `input focus:border-primary text-base-content duration-300 focus:outline-hidden ${icon && "pl-12"}`,
            statusClass,
            inputClassName
          )}
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center justify-center">
          <button
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
        className="text-error h-2 text-xs duration-300 data-[validate=false]:opacity-0 data-[validate=true]:opacity-100"
      >
        {invalidMessage}
      </div>
    </div>
  );
};

Input.Password = Password;

export type EmailProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type" | "onChange"> & {
  inputStyleType?: "bordered" | "borderless" | "underline";
  value: string;
  cacheKey?: string;
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
const Email = ({
  inputStyleType = "bordered",
  className,
  nullable,
  value,
  cacheKey,
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
  const { l } = usePage();
  const inputRef = useRef<HTMLInputElement>(null);
  const isValidEmail = isEmail(value);
  const [firstFocus, setFirstFocus] = useState(true);
  const validateResult = !isValidEmail ? l("base.emailInvalidError") : validate(value);
  const status: "error" | "warning" | "success" =
    !nullable && !value.length ? "warning" : !isValidEmail ? "error" : validateResult === true ? "success" : "error";
  const invalidMessage =
    !value.length || validateResult === true || firstFocus
      ? null
      : validateResult === false
        ? l("base.invalidValueError")
        : validateResult;
  const statusClass =
    status === "error"
      ? "input-error"
      : !firstFocus && status === "warning"
        ? "input-warning"
        : status === "success"
          ? "input-success"
          : "";
  const inputType =
    inputStyleType === "bordered"
      ? "input-bordered"
      : inputStyleType === "borderless"
        ? "input"
        : "input-bordered rounded-none";
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onPressEnter && e.key === "Enter") onPressEnter(e.currentTarget.value, e);
    if (e.key === "Escape") {
      e.currentTarget.blur();
      onPressEscape?.(e);
    }
  };

  useEffect(() => {
    if (!cacheKey) return;
    const value = sessionStorage.getItem(cacheKey);
    if (value) {
      onChange?.(value);
    }
  }, []);

  return (
    <div className={clsx("relative isolate mb-5", className)}>
      <div className={clsx("flex items-center", inputWrapperClassName)}>
        {icon ? (
          <div className={clsx("absolute inset-y-0 left-4 z-10 flex items-center justify-center", iconClassName)}>
            {icon}
          </div>
        ) : null}
        <input
          {...rest}
          type="email"
          value={value}
          ref={inputRef}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            if (firstFocus && value) setFirstFocus(false);
          }}
          onChange={(e) => {
            if (cacheKey) {
              sessionStorage.setItem(cacheKey, e.target.value);
            }
            onChange?.(e.target.value, e);
          }}
          className={clsx(
            `input focus:border-primary text-base-content outline-hidden duration-300 focus:outline-hidden ${
              icon && "pl-12"
            }`,
            inputType,
            statusClass,
            inputClassName
          )}
        />
      </div>
      {invalidMessage ? (
        <div className="text-error animate-fadeIn absolute -bottom-4 text-xs">{invalidMessage}</div>
      ) : null}
    </div>
  );
};

Input.Email = Email;

export type NumberProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type" | "onChange"> & {
  value: number | null;
  nullable?: boolean;
  icon?: React.ReactNode;
  cacheKey?: string;
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
const Number = ({
  className,
  nullable,
  value,
  icon,
  cacheKey,
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
  const { l } = usePage();
  const inputRef = useRef<HTMLInputElement>(null);
  const validateResult = validate ? validate(value) : undefined;
  const generateFormat = () => {
    return isNaN(value ?? 0) ? "" : formatter ? formatter(value?.toString() ?? "") : (value?.toString() ?? "");
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
  const invalidMessage =
    value === null || validateResult === true
      ? null
      : validateResult === false
        ? l("base.invalidValueError")
        : validateResult;
  const statusClass =
    validate !== undefined
      ? status === "error"
        ? "input-error"
        : !firstFocus && status === "warning"
          ? "input-warning"
          : status === "success"
            ? "input-success"
            : "input"
      : "input";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const numberValue = parseFloat(e.currentTarget.value.replace(/[^\d-]/g, ""));
    if (e.key === "Enter") {
      if (isNaN(numberValue)) {
        e.currentTarget.value = "";
        setFormatValue("");
        onChange(null);
        return;
      }
      if (rest.max !== undefined && numberValue > parseFloat(rest.max as string)) {
        const maxValue = formatter ? formatter(String(rest.max)) : String(rest.max);
        e.currentTarget.value = maxValue;
        setFormatValue(maxValue);
        onPressEnter?.(parseFloat(maxValue), e);
        return;
      } else if (rest.min !== undefined && numberValue < parseFloat(rest.min as string)) {
        const minValue = formatter ? formatter(String(rest.min)) : String(rest.min);
        e.currentTarget.value = minValue;
        setFormatValue(minValue);
        onPressEnter?.(parseFloat(minValue), e);
        return;
      }
      setFormatValue(formatter ? formatter(String(numberValue)) : String(numberValue));
      onPressEnter?.(numberValue, e);
    }
    if (e.key === "Escape") {
      if (isNaN(numberValue)) {
        e.currentTarget.value = "";
        setFormatValue("");
        onChange(null);
        return;
      }
      if (rest.max !== undefined && numberValue > parseFloat(rest.max as string)) {
        e.currentTarget.value = formatter ? formatter(String(rest.max)) : String(rest.max);
      } else if (rest.min !== undefined && numberValue < parseFloat(rest.min as string)) {
        e.currentTarget.value = formatter ? formatter(String(rest.min)) : String(rest.min);
      }
      e.currentTarget.blur();
      onPressEscape?.(e);
    }
  };

  useEffect(() => {
    if (cacheKey) {
      const value = sessionStorage.getItem(cacheKey);
      if (value) {
        setFormatValue(value);
        onChange(parser ? parseFloat(value) : parseFloat(value));
      }
    } else {
      setFormatValue(generateFormat());
    }
  }, []);

  useEffect(() => {
    setFormatValue(generateFormat());
  }, [value]);

  return (
    <div className={clsx("relative isolate", className)}>
      <div className={clsx("flex items-center", inputWrapperClassName)}>
        {icon ? (
          <div className={clsx("absolute inset-y-0 left-4 z-10 flex items-center justify-center", iconClassName)}>
            {icon}
          </div>
        ) : null}
        <input
          {...rest}
          ref={inputRef}
          value={formatValue}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            // if (rest.max !== undefined && parsedValue > parseFloat(rest.max as string)) {
            //   e.target.value = formatter ? formatter(String(rest.max)) : String(rest.max);
            // } else if (rest.min !== undefined && parsedValue < parseFloat(rest.min as string)) {
            //   e.target.value = formatter ? formatter(String(rest.min)) : String(rest.min);
            // }
            if (firstFocus && value) setFirstFocus(false);
          }}
          onChange={(e) => {
            //string만 허용
            const parsedValue = parser ? parser(e.target.value) : e.target.value;
            setFormatValue(formatter ? formatter(parsedValue) : e.target.value);
            onChange(parser ? parseFloat(parsedValue) : parseFloat(e.target.value), e);
            if (cacheKey) sessionStorage.setItem(cacheKey, parsedValue);
          }}
          className={clsx(
            `input focus:border-primary text-base-content duration-300 focus:outline-hidden ${icon && "pl-12"}`,
            statusClass,
            inputClassName
          )}
        />
      </div>

      {invalidMessage ? (
        <div className="text-error animate-fadeIn absolute -bottom-4 text-xs">{invalidMessage}</div>
      ) : null}
    </div>
  );
};

Input.Number = Number;

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  className?: string;
  checked: boolean;
  onChange: (checked: boolean, e: ChangeEvent<HTMLInputElement>) => void;
};

const Checkbox = ({ checked, onChange, className, ...rest }: CheckboxProps) => {
  return (
    <input
      {...rest}
      type="checkbox"
      checked={checked}
      className={clsx("checkbox", className)}
      onChange={(e) => {
        onChange(e.target.checked, e);
      }}
    />
  );
};
Input.Checkbox = Checkbox;
