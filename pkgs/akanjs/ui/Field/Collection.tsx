"use client";
import { cn, usePage } from "akanjs/client";
import { useFieldTool } from "akanjs/store";
import { Fragment, type ReactNode, useState } from "react";
import { AiOutlinePlus } from "react-icons/ai";
import { BiTrash, BiX } from "react-icons/bi";
import { MdDragIndicator } from "react-icons/md";
import { agentAttrs } from "../agentAttrs";
import { badgeRecipe } from "../Badge";
import { buttonRecipe } from "../Button";
import { DraggableList } from "../DraggableList";
import { Input } from "../Input";
import { useUiRecipe } from "../UiOverride";
import { Label } from "./Label";
import { lengthValidator } from "./Text";

export interface ListProps<Item> {
  className?: string;
  labelClassName?: string;
  label?: string;
  desc?: string;
  nullable?: boolean;
  value: Item[] | null;
  onChange: (value: Item[]) => void;
  onAdd: () => void;
  renderItem: (item: Item, idx: number) => ReactNode;
}
export const List = <Item,>({
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
  const recipe = useUiRecipe("button") ?? buttonRecipe;
  useFieldTool(onChange);
  const items = value ?? [];
  return (
    <div {...agentAttrs(onChange)} className={cn("flex w-full flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <div className="mb-2 flex w-full flex-col gap-2 rounded-box border border-border p-2">
        {items.map((item, idx) => (
          // `Fragment` so the key sits on the list child; index-keyed since embedded scalars have no id.
          <Fragment key={idx}>
            <div className="flex h-full w-full items-center justify-between gap-2">
              {renderItem(item, idx)}
              <div className="flex gap-2 border-border border-l pl-2">
                <button
                  type="button"
                  className={recipe(
                    { variant: "outline", size: "icon" },
                    "size-6 border-destructive p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground",
                  )}
                  onClick={() => {
                    onChange(items.filter((_, i) => i !== idx));
                  }}
                >
                  <BiTrash />
                </button>
              </div>
            </div>
            {idx < items.length - 1 ? <div className="h-[0.5px] w-full bg-muted px-2" /> : null}
          </Fragment>
        ))}
        <button
          type="button"
          className={recipe({ variant: "outline" })}
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

export interface TextListProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  value: string[] | null;
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
}
export const TextList = ({
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
  validate,
  inputClassName,
}: TextListProps) => {
  useFieldTool(onChange, { transform, disabled, sortable: true });
  const { l } = usePage();
  const recipe = useUiRecipe("button") ?? buttonRecipe;
  const texts = value ?? [];
  return (
    <div {...agentAttrs(onChange)} className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={!minlength} label={label} desc={desc} /> : null}
      <div className="mb-5 h-full gap-2 rounded-box border border-border p-2">
        <DraggableList
          className="h-full gap-2"
          // Wrapped on purpose: passing the setter down would publish the field again from the inner list.
          onChange={(sorted: string[]) => {
            onChange(sorted);
          }}
          onRemove={(_, idx) => {
            onChange(texts.filter((_, i) => i !== idx));
          }}
        >
          {texts.map((text, idx) => (
            <DraggableList.Item key={idx} value={text}>
              <div className="flex w-full items-center">
                <DraggableList.Cursor>
                  <MdDragIndicator className="text-xl" />
                </DraggableList.Cursor>
                <div className="flex w-full items-center justify-center gap-5">
                  <Input
                    value={text}
                    onChange={(text) => {
                      const newValue = [...texts];
                      newValue[idx] = transform(text);
                      onChange(newValue);
                    }}
                    validate={lengthValidator(l, minTextlength, maxTextlength, validate)}
                    className={cn("w-full", inputClassName)}
                    inputClassName="h-8 w-full"
                    placeholder={placeholder}
                    disabled={disabled}
                  />
                  <button
                    type="button"
                    className={recipe(
                      { variant: "outline", size: "icon" },
                      "size-6 border-destructive p-0 text-destructive hover:bg-destructive hover:text-destructive-foreground",
                    )}
                    onClick={() => {
                      onChange(texts.filter((_, i) => i !== idx));
                    }}
                  >
                    <BiTrash />
                  </button>
                </div>
              </div>
            </DraggableList.Item>
          ))}
        </DraggableList>
        <div className="my-5 h-[0.5px] bg-foreground/20" />
        {texts.length < maxlength ? (
          <button
            type="button"
            className={recipe({ variant: "outline" }, "w-full")}
            onClick={() => {
              onChange([...texts, ""]);
            }}
          >
            + New
          </button>
        ) : null}
      </div>
    </div>
  );
};

export interface TagsProps extends TextListProps {
  secret?: boolean;
}
export const Tags = ({
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
  useFieldTool(onChange, { transform, disabled });
  const { l } = usePage();
  const badge = useUiRecipe("badge") ?? badgeRecipe;
  const tagList = value ?? [];
  const [inputVisible, setInputVisible] = useState(false);
  const [tag, setTag] = useState("");
  const addTag = () => {
    if (!tag.length) return;
    onChange([...tagList, tag]);
    setInputVisible(false);
    setTag("");
  };

  return (
    <div {...agentAttrs(onChange)} className={cn("flex flex-col", className)}>
      {label ? <Label className={labelClassName} nullable={!minlength} label={label} desc={desc} /> : null}
      <div className="flex w-full flex-wrap items-center gap-1 rounded-box border border-border p-2">
        {tagList.map((val, idx) => (
          <span className={badge({ variant: "outline" }, "items-center")} key={idx}>
            <div className="text-xs italic">#</div>
            {val}
            <BiX
              className="ml-1 cursor-pointer opacity-50 duration-200 hover:opacity-100"
              onClick={() => {
                if (!disabled) onChange(tagList.filter((v, i) => i !== idx));
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
            onPressEscape={(e) => {
              e.preventDefault();
              setInputVisible(false);
              setTag("");
            }}
            validate={lengthValidator(l, minTextlength, maxTextlength, validate)}
          />
        ) : !disabled ? (
          <div
            className="flex items-center gap-2 rounded-full bg-success px-2 py-1 text-success-foreground text-xs duration-200 hover:cursor-pointer hover:opacity-80"
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
