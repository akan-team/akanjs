import { clsx, usePage } from "@akanjs/client";

interface ToggleSelectProps<I extends string | number | boolean | null> {
  className?: string;
  btnClassName?: string;
  items: string[] | number[] | { label: string; value: I; disabled?: boolean }[];
  value: I;
  nullable: boolean;
  validate: (value: I) => boolean | string;
  onChange: (value: I, idx: number) => void;
  disabled?: boolean;
}
export const ToggleSelect = <I extends string | number | boolean | null>({
  className,
  btnClassName,
  items,
  nullable,
  validate,
  value,
  onChange,
  disabled,
}: ToggleSelectProps<I>) => {
  const { l } = usePage();
  const validateResult = value ? validate(value) : false;
  // const status: "error" | "warning" | "success" =
  //   !nullable && !value?.length ? "warning" : validateResult === true ? "success" : "error";
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
      }
  );
  return (
    <div
      className={clsx(
        "border-base-content/20 relative flex w-full flex-wrap items-center gap-1 rounded-md border p-2",
        className
      )}
    >
      {options.map((option, idx: number) => {
        const isSelected = value === option.value;
        const isDisabled = (disabled ?? false) || (option.disabled ?? false);
        return (
          <button
            key={idx}
            disabled={isDisabled}
            className={clsx(
              "btn btn-sm",
              { "bg-success/70 text-success-content": isSelected, "cursor-not-allowed": isDisabled },
              // {
              //   "btn-error": status === "error",
              //   "btn-warning": status === "warning",
              // },
              btnClassName
            )}
            onClick={() => {
              onChange(option.value, idx);
            }}
          >
            {option.label}
          </button>
        );
      })}
      {invalidMessage ? (
        <div className="text-error animate-fadeIn absolute -bottom-4 text-xs">{invalidMessage}</div>
      ) : null}
    </div>
  );
};

interface MultiProps {
  className?: string;
  btnClassName?: string;
  items: string[] | number[] | { label: string; value: string | number; disabled?: boolean }[];
  value: string[] | number[];
  nullable: boolean;
  validate: (value: string[] | number[]) => boolean | string;
  onChange: (value: string[] | number[]) => void;
  disabled?: boolean;
}
const Multi = ({ className, btnClassName, items, nullable, validate, value, onChange, disabled }: MultiProps) => {
  const { l } = usePage();
  const validateResult = validate(value);
  // const status: "error" | "warning" | "success" =
  //   !nullable && !value.length ? "warning" : validateResult === true ? "success" : "error";
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
      }
  );
  return (
    <div
      className={clsx(
        "border-base-content/20 relative flex w-full flex-wrap items-center gap-1 rounded-md border p-2",
        className
      )}
    >
      {options.map((option, idx) => {
        const isSelected = (value as string[]).includes(option.value as string);
        const isDisabled = (disabled ?? false) || (option.disabled ?? false);
        return (
          <button
            key={idx}
            disabled={isDisabled}
            className={clsx(
              "btn btn-sm",
              { "bg-success/70 text-success-content": isSelected, "cursor-not-allowed": isDisabled },
              btnClassName
            )}
            onClick={() => {
              onChange(
                isSelected
                  ? (value.filter((i) => i !== option.value) as string[])
                  : ([...value, option.value].sort(
                      (a, b) =>
                        options.findIndex((o) => o.value === a) -
                        items.findIndex((o) => (o as { label: string; value: string }).value === b)
                    ) as string[])
              );
            }}
          >
            {option.label}
          </button>
        );
      })}
      {invalidMessage ? (
        <div className="text-error animate-fadeIn absolute -bottom-4 text-xs">{invalidMessage}</div>
      ) : null}
    </div>
  );
};
ToggleSelect.Multi = Multi;
