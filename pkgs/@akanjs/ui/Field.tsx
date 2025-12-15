"use client";
import { DataList, Dayjs, dayjs, EnumInstance, isEnum } from "@akanjs/base";
import { clsx, usePage } from "@akanjs/client";
import { capitalize, formatPhone, isPhoneNumber, lowerlize } from "@akanjs/common";
import { st } from "@akanjs/store";
import { memo, ReactNode, useState } from "react";
import { AiOutlinePlus } from "react-icons/ai";
import { BiHelpCircle, BiTrash, BiX } from "react-icons/bi";
import { MdDragIndicator } from "react-icons/md";

import { DraggableList } from "./DraggableList";
import { Input } from "./Input";
import { Select } from "./Select";
import { ToggleSelect as UtilToggleSelect } from "./ToggleSelect";

interface LabelProps {
  className?: string;
  label: string;
  desc?: string;
  unit?: string;
  nullable?: boolean;
  mode?: "view" | "edit";
}
const Label = ({ className, label, desc, unit, nullable, mode = "edit" }: LabelProps) => {
  return (
    <span className={clsx("flex shrink-0 items-center gap-1", className)}>
      {/* {!nullable && mode === "edit" ? <span>* </span> : null} */}
      {capitalize(label)}
      {unit ? <span className="animate-fadeIn"> ({unit})</span> : null}
      {desc ? (
        <span className="tooltip tooltip-info tooltip-right" data-tip={desc}>
          <BiHelpCircle />
        </span>
      ) : null}
      {nullable ? <span className="text-sm text-gray-400">{"(optional)"}</span> : null}
    </span>
  );
};

interface FieldProps {
  className?: string;
  containerClassName?: string;
  labelClassName?: string;
  label?: string;
  desc?: string;
  nullable?: boolean;
  children?: any;
}
export const Field = ({
  className,
  containerClassName,
  labelClassName,
  label,
  desc,
  nullable,
  children,
}: FieldProps) => {
  return (
    <div className={clsx("w-full", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <div className={clsx("mt-2 flex w-full flex-col gap-4 px-4", containerClassName)}>{children}</div>
    </div>
  );
};
Field.Label = Label;

interface ListProps<Item> {
  className?: string;
  labelClassName?: string;
  label?: string;
  desc?: string;
  nullable?: boolean;
  value: Item[];
  onChange: (value: Item[]) => void;
  onAdd: () => void;
  renderItem: (item: Item, idx: number) => ReactNode;
}
const List = <Item,>({
  className,
  labelClassName,
  label,
  desc,
  value,
  onChange,
  onAdd,
  nullable,
  renderItem,
}: ListProps<Item>) => {
  const { l } = usePage();
  return (
    <div className={clsx("flex w-full flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <div className="mb-2 flex w-full flex-col gap-2 rounded-md border border-gray-300 p-2">
        {value.map((item, idx) => (
          <>
            <div key={idx} className="flex h-full w-full items-center justify-between gap-2">
              {renderItem(item, idx)}
              <div className="flex gap-2 border-l border-gray-300 pl-2">
                <button
                  className="btn btn-xs btn-error btn-square btn-outline"
                  onClick={() => {
                    onChange(value.filter((_, i) => i !== idx));
                  }}
                >
                  <BiTrash />
                </button>
              </div>
            </div>
            <div className="h-[0.5px] w-full bg-gray-300 px-2 last:h-0" />
          </>
        ))}
        <button
          className="btn btn-outline"
          onClick={() => {
            onAdd();
          }}
        >
          +
        </button>
      </div>
    </div>
  );
};
Field.List = List;

interface TextProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: string | null;
  //! 내일 볼게
  onChange: (value: string) => void;
  inputClassName?: string;
  placeholder?: string;
  nullable?: boolean;
  cache?: boolean;
  disabled?: boolean;
  transform?: (value: string) => string;
  validate?: (text: string) => boolean | string;
  minlength?: number;
  maxlength?: number;
  onPressEnter?: () => void;
  inputStyleType?: "bordered" | "borderless" | "underline";
}
const Text = ({
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
  cache,
  inputClassName,
  inputStyleType = "bordered",
}: TextProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Input
        cacheKey={cache ? `${label}-${desc}-text` : undefined}
        inputStyleType={inputStyleType}
        value={value ?? ""}
        nullable={nullable}
        placeholder={placeholder}
        onChange={(value) => {
          onChange(transform(value));
        }}
        disabled={disabled}
        className={clsx("w-full", "")}
        inputClassName={clsx("focus:border-primary w-full", inputClassName)}
        validate={(text: string) => {
          if (text.length < minlength) return l("base.textTooShortError", { minlength });
          else if (text.length > maxlength) return l("base.textTooLongError", { maxlength });
          else return validate?.(text) ?? true;
        }}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};
Field.Text = memo(Text);

//! 삭제
interface PriceProps {
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
  inputStyleType?: "bordered" | "borderless" | "underline";
}
const Price = ({
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
  maxlength = 80,
  transform = (v) => v,
  validate,
  onPressEnter,
  inputClassName,
  inputStyleType = "bordered",
}: PriceProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Input
        inputStyleType={inputStyleType}
        value={value ?? ""}
        nullable={nullable}
        placeholder={placeholder ?? `~ ${l("base.priceUnit")}`}
        onChange={(value) => {
          const withoutComma = value.replace(/,/g, "").replace(/ /g, "");
          onChange(transform(withoutComma));
        }}
        disabled={disabled}
        className={clsx("w-full", "")}
        inputClassName={clsx("focus:border-primary w-full", inputClassName)}
        validate={(text: string) => {
          if (text.length < minlength) return l("base.textTooShortError", { minlength });
          else if (text.length > maxlength) return l("base.textTooLongError", { maxlength });
          else return validate?.(text) ?? true;
        }}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};
Field.Price = memo(Price);

interface TextAreaProps {
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
  rows?: number;
  minlength?: number;
  maxlength?: number;
  cache?: boolean;
  onPressEnter?: () => void;
}
const TextArea = ({
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
  cache,
  inputClassName,
}: TextAreaProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Input.TextArea
        value={value ?? ""}
        cacheKey={cache ? `${label}-${desc}-textArea` : undefined}
        nullable={nullable}
        placeholder={placeholder}
        onChange={(value) => {
          onChange(transform(value));
        }}
        disabled={disabled}
        rows={rows}
        className={clsx("h-full w-full")}
        inputClassName={clsx("focus:border-primary w-full", inputClassName)}
        validate={(text: string) => {
          if (text.length < minlength) return l("base.textTooShortError", { minlength });
          else if (text.length > maxlength) return l("base.textTooLongError", { maxlength });
          else return validate?.(text) ?? true;
        }}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};
Field.TextArea = memo(TextArea);

interface SwitchProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  inputClassName?: string;
  onDesc?: string;
  offDesc?: string;
  disabled?: boolean;
}
const Switch = ({
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
}: SwitchProps) => {
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable label={label} desc={desc} /> : null}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          disabled={disabled}
          className={clsx("toggle toggle-accent", inputClassName)}
          checked={value}
          onChange={(e) => {
            onChange(e.target.checked);
          }}
        />
        {(onDesc ?? offDesc) ? <div className="text-info text-sm">{value ? onDesc : offDesc}</div> : null}
      </div>
    </div>
  );
};
Field.Switch = Switch;

interface ToggleSelectProps<I> {
  className?: string;
  labelClassName?: string;
  label?: string;
  desc?: string;
  model?: string;
  field?: string;
  items: { label: string; value: I; disabled?: boolean }[] | readonly I[] | I[] | EnumInstance<string, I>;
  value: I;
  nullable?: boolean;
  disabled?: boolean;
  validate?: (value: I) => boolean | string;
  onChange: (value: I) => void;
  btnClassName?: string;
}
const ToggleSelect = <I extends string | number | boolean | null>({
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
}: ToggleSelectProps<I>) => {
  const { l } = usePage();
  const isEnumValue = isEnum(items as EnumInstance<string, I>);
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <UtilToggleSelect
        className="mt-2"
        nullable={!!nullable}
        btnClassName={btnClassName}
        items={
          isEnumValue
            ? ((items as EnumInstance<string, I>).values.map((item) => ({
                label: l._(`${(items as EnumInstance).refName}.${item}`),
                value: item,
              })) as { label: string; value: I; disabled?: boolean }[])
            : (items as { label: string; value: I; disabled?: boolean }[])
        }
        value={value}
        onChange={(value: I, idx) => {
          onChange(value);
        }}
        disabled={disabled}
        validate={(value: I) => {
          return validate?.(value) ?? true;
        }}
      />
    </div>
  );
};
Field.ToggleSelect = ToggleSelect;

interface MultiToggleSelectProps<I extends string | number | boolean> {
  className?: string;
  labelClassName?: string;
  label?: string;
  desc?: string;
  items: EnumInstance<string, I> | { label: string; value: I; disabled?: boolean }[] | readonly I[] | I[];
  value: I[];
  disabled?: boolean;
  minlength?: number;
  maxlength?: number;
  validate?: (value: I[]) => boolean | string;
  onChange: (value: I[]) => void;
}
const MultiToggleSelect = <I extends string | number | boolean>({
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
  const { l } = usePage();
  const isEnumValue = isEnum(items as EnumInstance<string, I>);
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={!!minlength} label={label} desc={desc} /> : null}
      <UtilToggleSelect.Multi
        nullable={!minlength}
        items={
          isEnumValue
            ? ((items as EnumInstance<string, I>).values.map((item) => ({
                label: l._(`${(items as EnumInstance).refName}.${item}`),
                value: item,
              })) as { label: string; value: string; disabled?: boolean }[])
            : (items as { label: string; value: string; disabled?: boolean }[])
        }
        value={value as string[]}
        onChange={(values) => {
          onChange(values as I[]);
        }}
        disabled={disabled}
        validate={(value: string[]) => {
          if (minlength && value.length < minlength) return l("base.selectTooShortError", { minlength });
          else if (maxlength && value.length > maxlength) return l("base.selectTooLongError", { maxlength });
          else return validate?.(value as I[]) ?? true;
        }}
      />
    </div>
  );
};
Field.MultiToggleSelect = MultiToggleSelect;

interface TextListProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: string[];
  onChange: (value: string[]) => void;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  cache?: boolean;
  transform?: (value: string) => string;
  validate?: (text: string) => boolean | string;
  minlength?: number;
  maxlength?: number;
  minTextlength?: number;
  maxTextlength?: number;
}
const TextList = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  placeholder,
  disabled,
  transform = (v) => v,
  minlength = 0,
  maxlength = 50,
  minTextlength = 2,
  maxTextlength = 200,
  cache,
  validate,
  inputClassName,
}: TextListProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={!minlength} label={label} desc={desc} /> : null}
      <div className="mb-5 h-full gap-2 rounded-md border border-gray-300 p-2">
        <DraggableList
          className="h-full gap-2"
          onChange={onChange}
          onRemove={(_, idx) => {
            onChange(value.filter((_, i) => i !== idx));
          }}
        >
          {value.map((text, idx) => (
            <DraggableList.Item key={idx} value={text}>
              <div className="flex w-full items-center">
                <DraggableList.Cursor>
                  <MdDragIndicator className="text-xl" />
                </DraggableList.Cursor>
                <div className="flex w-full items-center justify-center gap-5">
                  <Input
                    value={text}
                    cacheKey={cache ? `${label}-${desc}-textList-[${idx}]` : undefined}
                    onChange={(text) => {
                      const newValue = [...value];
                      newValue[idx] = transform(text);
                      onChange(newValue);
                    }}
                    validate={(text: string) => {
                      if (text.length < minlength) return l("base.textTooShortError", { minlength: minTextlength });
                      else if (text.length > maxlength) return l("base.textTooLongError", { maxlength: maxTextlength });
                      else return validate?.(text) ?? true;
                    }}
                    className={clsx("w-full", inputClassName)}
                    inputClassName="w-full input-sm"
                    placeholder={placeholder}
                    disabled={disabled}
                  />
                  <button
                    className="btn btn-xs btn-error btn-square btn-outline"
                    onClick={() => {
                      onChange(value.filter((_, i) => i !== idx));
                    }}
                  >
                    <BiTrash />
                  </button>
                </div>
              </div>
            </DraggableList.Item>
          ))}
        </DraggableList>
        <div className="bg-base-content/20 my-5 h-[0.5px]" />
        {value.length <= maxTextlength ? (
          <button
            className="btn btn-outline w-full"
            onClick={() => {
              onChange([...value, ""]);
            }}
          >
            + New
          </button>
        ) : null}
      </div>
    </div>
  );
};
Field.TextList = TextList;

interface TagsProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: string[];
  onChange: (value: string[]) => void;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  transform?: (value: string) => string;
  validate?: (text: string) => boolean | string;
  minlength?: number;
  maxlength?: number;
  minTextlength?: number;
  maxTextlength?: number;
  secret?: boolean;
}
const Tags = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  placeholder,
  disabled,
  transform = (v) => v,
  minlength = 0,
  maxlength = 50,
  minTextlength = 2,
  maxTextlength = 10,
  validate,
  inputClassName,
}: TagsProps) => {
  const { l } = usePage();
  const [inputVisible, setInputVisible] = useState(false);
  const [tag, setTag] = useState("");
  const addTag = () => {
    if (!tag.length) return;
    onChange([...value, tag]);
    setInputVisible(false);
    setTag("");
  };

  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={!minlength} label={label} desc={desc} /> : null}
      <div className="border-base-content/20 flex w-full flex-wrap items-center gap-1 rounded-md border p-2">
        {value.map((val, idx) => (
          <span className="badge badge-outline items-center rounded-full text-xs" key={idx}>
            <div className="text-xs italic">#</div>
            {val}
            <BiX
              className="ml-1 cursor-pointer opacity-50 duration-200 hover:opacity-100"
              onClick={() => {
                if (!disabled) onChange(value.filter((v, i) => i !== idx));
              }}
            />
          </span>
        ))}
        {inputVisible ? (
          <Input
            autoFocus
            icon={<div className="text-xs italic">#</div>}
            className="h-6 w-24 items-center justify-start rounded-full border px-4"
            inputClassName="focus:border-0 border-0 bg-transparent text-xs h-full w-full"
            placeholder={placeholder}
            value={tag}
            onChange={(value) => {
              if (value.length > maxTextlength) return;
              setTag(transform(value));
            }}
            onBlur={addTag}
            onPressEnter={addTag}
            onPressEscape={() => {
              setInputVisible(false);
              setTag("");
            }}
            validate={(text: string) => {
              if (text.length < minTextlength) return l("base.textTooShortError", { minlength: minTextlength });
              else if (text.length > maxTextlength) return l("base.textTooLongError", { maxlength: maxTextlength });
              else return validate?.(text) ?? true;
            }}
          />
        ) : !disabled ? (
          <div
            // className="badge badge-sm badge-success  items-center hover:text-base-100 hover:cursor-pointer hover:bg-red-500 duration-200"
            className="bg-success text-success-content flex items-center gap-2 rounded-full px-2 py-1 text-xs duration-200 hover:cursor-pointer hover:opacity-80"
            onClick={() => {
              setInputVisible(true);
            }}
          >
            <AiOutlinePlus />
            New Tag
          </div>
        ) : null}
      </div>
    </div>
  );
};
Field.Tags = Tags;

interface DateProps<Nullable extends boolean> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  nullable?: boolean;
  className?: string;
  min?: Dayjs;
  max?: Dayjs;
  value: Nullable extends true ? Dayjs | null : Dayjs;
  showTime?: boolean;
  onChange: (value: Dayjs) => void;
  dateClassName?: string;
}
const Date = <Nullable extends boolean>({
  className,
  labelClassName,
  nullable,
  label,
  desc,
  value,
  min,
  max,
  onChange,
  showTime,
  dateClassName,
}: DateProps<Nullable>) => {
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      {/* //! daysi UI datetime-local 컴포넌트에 max 값 넣으면 오른쪽 끝 짤리는 버그 있음.*/}
      <input
        type={showTime ? "datetime-local" : "date"}
        className={clsx(
          "input validator text-xs duration-200 outline-none focus-within:outline-none focus:outline-none",
          dateClassName
        )}
        min={min ? (showTime ? dayjs(min).format("YYYY-MM-DDTHH:mm") : dayjs(min).format("YYYY-MM-DD")) : undefined}
        max={max ? (showTime ? dayjs(max).format("YYYY-MM-DDTHH:mm") : dayjs(max).format("YYYY-MM-DD")) : undefined}
        value={value ? (showTime ? dayjs(value).format("YYYY-MM-DDTHH:mm") : dayjs(value).format("YYYY-MM-DD")) : ""}
        onChange={(e) => {
          onChange(dayjs(e.target.value));
        }}
      />
    </div>
  );
};
Field.Date = Date;

interface DateRangeProps<Nullable extends boolean> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  nullable?: Nullable;
  className?: string;
  min?: Dayjs;
  max?: Dayjs;
  from: Nullable extends true ? Dayjs | null : Dayjs;
  to: Nullable extends true ? Dayjs | null : Dayjs;
  showTime?: boolean;
  onChangeFrom: (value: Dayjs) => void;
  onChangeTo: (value: Dayjs) => void;
  onChange?: (from: Dayjs, to: Dayjs) => void;
}
const DateRange = <Nullable extends boolean>({
  className,
  labelClassName,
  nullable,
  label,
  desc,
  from,
  to,
  min,
  max,
  onChangeFrom,
  onChangeTo,
  onChange,
  showTime,
}: DateRangeProps<Nullable>) => {
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}

      <div className="relative flex w-full flex-col items-start gap-2 pt-2 text-center md:flex-row md:items-center">
        <div className="relative flex w-full flex-col items-start justify-start">
          <div className="bg-base-100 absolute -top-2 left-2 z-10 px-2 text-xs font-light">From</div>
          <Date
            className="w-full"
            dateClassName="w-full"
            showTime={showTime}
            value={from}
            max={max}
            min={min}
            onChange={(value: Dayjs) => {
              onChangeFrom(value);
            }}
          />
        </div>
        <div className="relative flex w-full flex-col items-start gap-2 text-center md:flex-row md:items-center">
          <div className="bg-base-100 absolute -top-2 left-2 z-10 px-2 text-xs font-light">To</div>
          <Date
            className="w-full"
            dateClassName="w-full"
            showTime={showTime}
            value={to}
            max={max}
            min={min}
            onChange={(value: Dayjs) => {
              onChangeTo(value);
            }}
          />
        </div>
      </div>
    </div>
  );
};
Field.DateRange = DateRange;

interface NumberProps {
  label?: string;
  desc?: string;
  className?: string;
  value: number | null;
  placeholder?: string;
  nullable?: boolean;
  disabled?: boolean;
  cache?: boolean;
  min?: number;
  max?: number;
  unit?: string;
  labelClassName?: string;
  inputClassName?: string;
  onChange: (value: number) => void;
  transform?: (value: number) => number;
  validate?: (text: number) => boolean | string;
  onPressEnter?: () => void;
  formatter?: (value: string) => string;
  parser?: (value: string) => string;
}
const Number = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  placeholder,
  nullable,
  disabled,
  min,
  max,
  cache,
  transform = (v) => v,
  validate,
  onPressEnter,
  inputClassName,
  unit,
  formatter,
  parser,
}: NumberProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} unit={unit} /> : null}
      <Input.Number
        min={min}
        max={max}
        cacheKey={cache ? `${label}-${desc}-number` : undefined}
        value={value}
        nullable={nullable}
        formatter={formatter}
        parser={parser}
        placeholder={placeholder}
        onChange={(value) => {
          onChange(transform(value ?? 0));
        }}
        disabled={disabled}
        className={clsx("w-full", "")}
        inputClassName={clsx(" w-full", inputClassName)}
        validate={(value: number) => {
          //수정여지
          if (min !== undefined && value < min) return l("base.numberTooSmallError", { min });
          else if (max !== undefined && value > max) return l("base.numberTooBigError", { max });
          else return validate?.(value) ?? true;
        }}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};
Field.Number = Number;

interface DoubleNumberProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: [number, number] | null;
  inputClassName?: string;
  placeholder?: string;
  nullable?: boolean;
  disabled?: boolean;
  min?: [number, number] | null;
  max?: [number, number] | null;
  separator?: ReactNode | string;
  cache?: boolean;
  onChange: (value: [number, number]) => void;
  transform?: (value: number) => number;
  validate?: (text: number) => boolean | string;
  onPressEnter?: () => void;
}
const DoubleNumber = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  placeholder,
  nullable,
  disabled,
  min,
  max,
  inputClassName,
  cache,
  separator,
  onChange,
  transform = (v) => v,
  validate,
  onPressEnter,
}: DoubleNumberProps) => {
  const { l } = usePage();
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <div className="flex items-center gap-2">
        <Input.Number
          value={value ? value[0] : 0}
          nullable={nullable}
          cacheKey={cache ? `${label}-${desc}-number-[0]` : undefined}
          placeholder={placeholder}
          onChange={(num) => {
            if (num === null) return;
            onChange([transform(num), value ? value[1] : 0]);
          }}
          disabled={disabled}
          className={clsx("w-full", "")}
          inputClassName={clsx("focus:border-primary w-full", inputClassName)}
          validate={(value: number) => {
            if (min && value < min[0]) return l("base.numberTooSmallError", { min: min[0] });
            else if (max && value > max[0]) return l("base.numberTooBigError", { max: max[0] });
            else return validate?.(value) ?? true;
          }}
          onPressEnter={onPressEnter}
        />
        {separator}
        <Input.Number
          cacheKey={cache ? `${label}-${desc}-number-[1]` : undefined}
          value={value ? value[1] : 0}
          nullable={nullable}
          placeholder={placeholder}
          onChange={(num) => {
            onChange([value ? value[0] : 0, transform(num ?? 0)]);
          }}
          disabled={disabled}
          className={clsx("w-full", "")}
          inputClassName={clsx("focus:border-primary w-full", inputClassName)}
          validate={(value: number) => {
            if (min && value < min[1]) return l("base.numberTooSmallError", { min: min[1] });
            else if (max && value > max[1]) return l("base.numberTooBigError", { max: max[1] });
            else return validate?.(value) ?? true;
          }}
          onPressEnter={onPressEnter}
        />
      </div>
    </div>
  );
};
Field.DoubleNumber = DoubleNumber;

interface EmailProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: string | null;
  cache?: boolean;
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
  inputStyleType?: "bordered" | "borderless" | "underline";
}
const Email = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  cache,
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
  const { l } = usePage();
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Input.Email
        value={value ?? ""}
        cacheKey={cache ? `${label}-${desc}-email` : undefined}
        nullable={nullable}
        placeholder={placeholder}
        onChange={(value) => {
          onChange(transform(value));
        }}
        disabled={disabled}
        className={clsx("w-full", "")}
        inputClassName={clsx("focus:border-primary w-full", inputClassName)}
        inputStyleType={inputStyleType}
        validate={(text: string) => {
          if (text.length < minlength) return l("base.textTooShortError", { minlength });
          else if (text.length > maxlength) return l("base.textTooLongError", { maxlength });
          else return validate?.(text) ?? true;
        }}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};
Field.Email = Email;

interface PhoneProps {
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
  cache?: boolean;
  transform?: (value: string) => string;
  validate?: (text: string) => boolean | string;
  minlength?: number;
  maxlength?: number;
  onPressEnter?: () => void;
}
const Phone = ({
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
  cache,
  transform = (v) => formatPhone(v),
  validate,
  onPressEnter,
  inputClassName,
}: PhoneProps) => {
  const { l } = usePage();

  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Input
        value={value ?? ""}
        cacheKey={cache ? `${label}-${desc}-phone` : undefined}
        nullable={nullable}
        placeholder={placeholder}
        onChange={(value) => {
          onChange(transform(value));
        }}
        disabled={disabled}
        maxLength={maxlength}
        className={clsx("w-full", "")}
        inputClassName={clsx("focus:border-primary w-full", inputClassName)}
        validate={(text: string) => {
          if (!isPhoneNumber(text)) return l("base.phoneInvalidError");
          else return validate?.(text) ?? true;
        }}
        onPressEnter={onPressEnter}
      />
    </div>
  );
};
Field.Phone = Phone;

interface PasswordProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: string | null;
  onChange: (value: string) => void;
  confirmValue?: string | null;
  onChangeConfirm?: (value: string) => void;
  inputClassName?: string;
  placeholder?: string;
  nullable?: boolean;
  disabled?: boolean;
  cache?: boolean;
  transform?: (value: string) => string;
  validate?: (text: string) => boolean | string;
  minlength?: number;
  maxlength?: number;
  onPressEnter?: () => void;
  showConfirm?: boolean;
}
const Password = ({
  label,
  desc,
  labelClassName,
  className,
  value,
  onChange,
  cache,
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
  const { l } = usePage();
  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <div className="flex flex-col gap-2">
        <Input.Password
          cacheKey={cache ? `${label}-${desc}-password` : undefined}
          value={value ?? ""}
          nullable={nullable}
          placeholder={placeholder ?? l("base.password")}
          onChange={(value) => {
            onChange(transform(value));
          }}
          disabled={disabled}
          className={clsx("w-full", "")}
          inputClassName={clsx("focus:border-primary w-full", inputClassName)}
          validate={(text: string) => {
            if (text.length < minlength) return l("base.textTooShortError", { minlength });
            else if (text.length > maxlength) return l("base.textTooLongError", { maxlength });
            else return validate?.(text) ?? true;
          }}
          onPressEnter={onPressEnter}
        />
        {showConfirm ? (
          <Input.Password
            value={confirmValue ?? ""}
            nullable={nullable}
            placeholder={l("base.passwordConfirm")}
            onChange={(value) => onChangeConfirm?.(transform(value))}
            disabled={disabled}
            className={clsx("w-full", "")}
            inputClassName={clsx("focus:border-primary w-full", inputClassName)}
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
Field.Password = Password;

interface ParentProps<T extends string, State, Input, Full, Light> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  selectClassName?: string;
  className?: string;
  disabled?: boolean;
  nullable?: boolean;
  initArgs?: any[];
  value: Light | null;
  sliceName: string;
  onChange: (value?: Light | null) => void;
  onSearch?: (text: string) => void;
  sortOption?: (a: Light, b: Light) => number;
  renderOption: (model: Light) => ReactNode;
  renderSelected?: (value: Light) => ReactNode;
}
const Parent = <T extends string, State, Input, Full extends { id: string }, Light extends { id: string }>({
  label,
  desc,
  labelClassName,
  selectClassName,
  className,
  nullable,
  disabled,
  initArgs,
  sliceName,
  value,
  onChange,
  onSearch,
  sortOption,
  renderOption,
  renderSelected = renderOption,
}: ParentProps<T, State, Input, Full, Light>) => {
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const [modelName, ModelName] = [lowerlize(refName), capitalize(refName)];
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };

  const names = {
    model: modelName,
    modelList: `${modelName}List`,
    modelListLoading: `${modelName}ListLoading`,
    refreshModel: `refresh${ModelName}`,
  };

  const namesOfSlice = {
    modelList: sliceName.replace(names.model, names.modelList),
    modelListLoading: sliceName.replace(names.model, names.modelListLoading),
    refreshModel: sliceName.replace(names.model, names.refreshModel),
  };

  const modelList = storeUse[namesOfSlice.modelList]() as DataList<Light>;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;

  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Select<string | null, false, true>
        label={label}
        desc={desc}
        labelClassName={labelClassName}
        selectClassName={selectClassName}
        value={value?.id ?? null}
        searchable
        options={modelList.map((model) => {
          const render = renderOption(model);
          return { label: typeof render === "string" ? render : model.id, value: model.id };
        })}
        renderOption={(modelId) => {
          if (!modelId) return null;
          const model = modelList.get(modelId);
          if (!model) return null;
          return renderOption(model);
        }}
        renderSelected={(modelId) => {
          if (!modelId) return null;
          const model = modelList.get(modelId);
          if (!model) return null;
          return renderSelected(model);
        }}
        onChange={(modelId) => {
          if (modelId) onChange(modelList.get(modelId) ?? null);
          else onChange(null);
        }}
        onOpen={() => {
          if (disabled) return;
          void storeDo[namesOfSlice.refreshModel]({ invalidate: true, queryArgs: initArgs });
        }}
        onSearch={onSearch}
      />
    </div>
  );
};
Field.Parent = Parent;

interface ParentIdProps<T extends string, State, Input, Full, Light> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  selectClassName?: string;
  disabled?: boolean;
  nullable?: boolean;
  initArgs?: any[];
  value: string | null;
  sliceName: string;
  onChange: (id?: string | null, model?: Light | null) => void;
  onSearch?: (text: string) => void;
  sortOption?: (a: Light, b: Light) => number;
  renderOption?: (model: Light) => ReactNode;
  renderSelected?: (value: Light) => ReactNode;
}
const ParentId = <T extends string, State, Input, Full extends { id: string }, Light extends { id: string }>({
  label,
  desc,
  className,
  selectClassName,
  labelClassName,
  nullable,
  disabled,
  initArgs,
  sliceName,
  value,
  onChange,
  onSearch,
  sortOption,
  renderOption,
  renderSelected = renderOption,
}: ParentIdProps<T, State, Input, Full, Light>) => {
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const [modelName, ModelName] = [lowerlize(refName), capitalize(refName)];
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const names = {
    model: modelName,
    modelList: `${modelName}List`,
    modelListLoading: `${modelName}ListLoading`,
    refreshModel: `refresh${ModelName}`,
  };
  const namesOfSlice = {
    modelList: sliceName.replace(names.model, names.modelList),
    modelListLoading: sliceName.replace(names.model, names.modelListLoading),
    refreshModel: sliceName.replace(names.model, names.refreshModel),
  };
  const modelList = storeUse[namesOfSlice.modelList]() as DataList<Light>;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;

  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Select<string | null, false, true>
        searchable
        desc={desc}
        label={label}
        labelClassName={labelClassName}
        selectClassName={selectClassName}
        value={value}
        options={modelList.map((model) => {
          const label = renderOption?.(model) ?? model.id;
          return { label: typeof label === "string" ? label : model.id, value: model.id };
        })}
        renderOption={(renderId) => {
          if (!renderId) return null;
          const model = modelList.get(renderId);
          if (!model) return null;
          return renderOption?.(model) ?? null;
        }}
        renderSelected={(renderId) => {
          if (!renderId) return null;
          const model = modelList.get(renderId);
          if (!model) return null;
          return renderSelected?.(model) ?? null;
        }}
        onOpen={() => {
          if (disabled) return;
          void storeDo[namesOfSlice.refreshModel]({ invalidate: true, queryArgs: initArgs });
        }}
        onChange={(modelId) => {
          if (modelId) onChange(modelId, modelList.get(modelId));
          else onChange(null, null);
        }}
        onSearch={onSearch}
      />
    </div>
  );
};
Field.ParentId = ParentId;

interface ChildrenProps<T extends string, State, Input, Full, Light> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  selectClassName?: string;
  className?: string;
  disabled?: boolean;
  nullable?: boolean;
  initArgs?: any[];
  value: Light[];
  onChange: (value?: Light[] | null) => void;
  onSearch?: (text: string) => void;
  sliceName: string;
  sortOption?: (a: Light, b: Light) => number;
  renderOption: (model: Light) => ReactNode;
  renderSelected?: (value: Light) => ReactNode;
}
const Children = <T extends string, State, Input, Full extends { id: string }, Light extends { id: string }>({
  label,
  desc,
  labelClassName,
  selectClassName,
  className,
  nullable,
  disabled,
  initArgs,
  sliceName,
  value,
  onChange,
  onSearch,
  sortOption,
  renderOption,
  renderSelected = renderOption,
}: ChildrenProps<T, State, Input, Full, Light>) => {
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const [modelName, ModelName] = [lowerlize(refName), capitalize(refName)];
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const names = {
    model: modelName,
    modelList: `${modelName}List`,
    modelListLoading: `${modelName}ListLoading`,
    refreshModel: `refresh${ModelName}`,
  };
  const namesOfSlice = {
    modelList: sliceName.replace(names.model, names.modelList),
    modelListLoading: sliceName.replace(names.model, names.modelListLoading),
    refreshModel: sliceName.replace(names.model, names.refreshModel),
  };
  const modelList = storeUse[namesOfSlice.modelList]() as DataList<Light>;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;

  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Select
        searchable
        desc={desc}
        label={label}
        labelClassName={labelClassName}
        selectClassName={selectClassName}
        multiple
        value={value.map((model) => model.id)}
        options={modelList.map((model) => {
          const label = renderOption(model);
          return { label: typeof label === "string" ? label : model.id, value: model.id };
        })}
        onOpen={() => {
          if (disabled) return;
          void storeDo[namesOfSlice.refreshModel]({ invalidate: true, queryArgs: initArgs });
        }}
        renderOption={(modelId: string) => {
          const model = modelList.get(modelId);
          if (!model) return null;
          return renderOption(model);
        }}
        renderSelected={(modelId: string) => {
          const model = modelList.get(modelId);
          if (!model) return null;
          return renderSelected(model);
        }}
        onChange={(modelIds: string[]) => {
          onChange(
            modelIds.map((id) => modelList.get(id)).filter((model) => model !== undefined) as unknown as Light[]
          );
        }}
        onSearch={onSearch}
      />
    </div>
  );
};
Field.Children = Children;

interface ChildrenIdProps<T extends string, State, Input, Full, Light> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  disabled?: boolean;
  nullable?: boolean;
  initArgs?: any[];
  value: string[];
  sliceName: string;
  onChange: (value: string[]) => void;
  onSearch?: (text: string) => void;
  sortOption?: (a: Light, b: Light) => number;
  renderOption: (model: Light) => ReactNode;
}
const ChildrenId = <T extends string, State, Input, Full extends { id: string }, Light extends { id: string }>({
  label,
  desc,
  labelClassName,
  className,
  nullable,
  disabled,
  initArgs,
  sliceName,
  value,
  onChange,
  onSearch,
  sortOption,
  renderOption,
}: ChildrenIdProps<T, State, Input, Full, Light>) => {
  const refName = (st.slice as { [key: string]: { refName: string } })[sliceName].refName;
  const [modelName, ModelName] = [lowerlize(refName), capitalize(refName)];
  const storeUse = st.use as { [key: string]: () => unknown };
  const storeDo = st.do as unknown as { [key: string]: (...args) => Promise<void> };
  const storeGet = st.get as unknown as <T>() => { [key: string]: T };
  const names = {
    model: modelName,
    modelList: `${modelName}List`,
    modelListLoading: `${modelName}ListLoading`,
    refreshModel: `refresh${ModelName}`,
  };
  const namesOfSlice = {
    modelList: sliceName.replace(names.model, names.modelList),
    modelListLoading: sliceName.replace(names.model, names.modelListLoading),
    refreshModel: sliceName.replace(names.model, names.refreshModel),
  };
  const modelList = storeUse[namesOfSlice.modelList]() as DataList<Light>;
  const modelListLoading = storeUse[namesOfSlice.modelListLoading]() as string | boolean;

  return (
    <div className={clsx("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Select
        searchable
        desc={desc}
        label={label}
        labelClassName={labelClassName}
        multiple
        // selectClassName={selectClassName}
        value={value}
        options={modelList.map((model) => {
          const label = renderOption(model);
          return { label: typeof label === "string" ? label : model.id, value: model.id };
        })}
        renderOption={(renderId) => {
          const model = modelList.get(renderId);
          if (!model) return null;
          return renderOption(model);
        }}
        onOpen={() => {
          if (disabled) return;
          void storeDo[namesOfSlice.refreshModel]({ invalidate: true, queryArgs: initArgs });
        }}
        onChange={(modelIds) => {
          onChange(modelIds);
        }}
        onSearch={onSearch}
      />
    </div>
  );
};
Field.ChildrenId = ChildrenId;
