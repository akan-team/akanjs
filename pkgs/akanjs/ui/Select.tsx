"use client";
import { type Cls, type EnumInstance, isEnum } from "akanjs/base";
import { cn, usePage } from "akanjs/client";
import { clamp } from "akanjs/common";
import { useFieldTool } from "akanjs/store";
import { useDebounce } from "akanjs/webkit";
import {
  type ComponentType,
  createElement,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { BiCheck, BiChevronDown, BiX } from "react-icons/bi";
import { BsQuestionCircleFill } from "react-icons/bs";
import { TiDelete } from "react-icons/ti";
import { agentAttrs } from "./agentAttrs";
import { Label } from "./Field/Label";
import { Spin } from "./Loading/Spin";
import { overlayZ, useOverlayLayerProps, useOverlayPortal } from "./overlayLayer";
import { useOverlayPosition } from "./overlayPosition";
import { createOverridable, useUiOverride } from "./UiOverride";

// Not `Loading.Spin`: that namespace reaches the `akanjs/ui` barrel, whose cycle back through `Field/index.tsx`
// half-initializes `Field/Relation`. A slot is looked up at render, so binding the name twice is harmless.
const LoadingSpin = createOverridable("LoadingSpin", Spin);

interface LabelOption<T> {
  label: string | boolean | number;
  value: T;
}
type Options<T> = T[] | LabelOption<T>[] | EnumInstance<string, T>;

export interface SelectProps<
  T extends string | number | boolean | null | undefined,
  Multiple extends boolean = false,
  Searchable extends boolean = false,
  Option extends Options<T> = Options<T>,
> {
  label?: ReactNode;
  desc?: ReactNode;
  labelClassName?: string;
  className?: string;
  value: Multiple extends true ? T[] : T;
  options: Searchable extends true ? (T extends string ? Option : LabelOption<T>[]) : Option;
  multiple?: Multiple;
  searchable?: Searchable;
  placeholder?: string;
  selectClassName?: string;
  selectorClassName?: string;
  selectedClassName?: string;
  /** Offers a clear row and a clear button. */
  nullable?: boolean;
  disabled?: boolean;
  /** Shows a spinner in place of the empty placeholder. */
  loading?: boolean;
  onOpen?: () => void;
  onChange: Multiple extends true ? (value: T[], prev: T[]) => void : (value: T, prev: T) => void;
  /** Replaces local filtering; debounced 300ms and never called with empty text. */
  onSearch?: (text: string) => void;
  empty?: ReactNode;
  renderOption?: (value: T) => ReactNode;
  renderSelected?: (value: T) => ReactNode;
}

const DefaultSelect = <
  T extends string | number | boolean | null | undefined,
  Multiple extends boolean = false,
  Searchable extends boolean = false,
  Option extends Options<T> = Options<T>,
>({
  label,
  desc,
  labelClassName,
  className,
  value,
  options,
  nullable,
  disabled,
  loading,
  multiple,
  searchable,
  placeholder,
  selectClassName,
  selectorClassName,
  selectedClassName,
  onOpen,
  onChange,
  onSearch,
  empty,
  renderOption,
  renderSelected,
}: SelectProps<T, Multiple, Searchable, Option>) => {
  useFieldTool(onChange, { disabled });
  const { l, lang } = usePage();
  const [isOpen, setIsOpen] = useState(false);
  const labeledOptions: LabelOption<T>[] = useMemo(() => {
    if (isEnum(options as Cls)) {
      const { refName, values } = options as EnumInstance<string, T>;
      return values.map((v) => {
        if (typeof v === "object") return { label: JSON.stringify(v), value: v };
        const key = `${refName}.${String(v)}`;
        const label = l._(key);
        // A value its dictionary does not name comes back as the dotted key, which reads worse than the value.
        return { label: label === key ? String(v) : label, value: v };
      });
    }
    const list = options as (T | LabelOption<T>)[];
    const first = list[0];
    // Keyed, not truthy: a `{ label: "-", value: null }` row is still a pair, and T is never an object.
    const isLabeled = typeof first === "object" && first !== null && "label" in first && "value" in first;
    return isLabeled
      ? (list as LabelOption<T>[])
      : (list as T[]).map((v) => ({ label: v as string | boolean | number, value: v }));
  }, [options, lang]);

  const [searchText, setSearchText] = useState("");
  const portal = useOverlayPortal();
  const [searchOptions, setSearchOptions] = useState<LabelOption<T>[]>(labeledOptions);
  const [activeIdx, setActiveIdx] = useState(-1);
  const listId = useId();
  const dropdownRef = useRef<HTMLDivElement>(null);
  // The field, not the wrapper: a panel placed above must clear the control, not its label.
  const fieldRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const overlayLayerProps = useOverlayLayerProps();
  const position = useOverlayPosition({
    opened: isOpen,
    triggerRef: fieldRef,
    panelRef: optionsRef,
    align: "start",
  });

  // Off the prop, not mirrored in state: a parent that refuses a change must keep its own value on screen.
  const selectedValues: T[] = multiple ? ((value as T[]) ?? []) : [value as T];
  const hasSelection = multiple ? selectedValues.length > 0 : value !== null && value !== undefined;
  // `null` is the clear row, walked by the keyboard like any option.
  const rows: (LabelOption<T> | null)[] = useMemo(
    () => (nullable ? [null, ...searchOptions] : searchOptions),
    [nullable, searchOptions],
  );

  const selected = (v: T) => (multiple ? selectedValues.includes(v) : v === selectedValues[0]);

  const resetSearch = () => {
    setSearchText("");
    setSearchOptions(labeledOptions);
  };
  const close = () => {
    setIsOpen(false);
    setActiveIdx(-1);
    resetSearch();
  };

  const handleClickOutside = (event: Event) => {
    const target = event.target as Node;
    // The options portal out of this subtree.
    if (optionsRef.current?.contains(target)) return;
    if (dropdownRef.current && !dropdownRef.current.contains(target)) close();
  };
  const onSelect = (v: T) => {
    if (multiple) {
      const next = selectedValues.includes(v) ? selectedValues.filter((rev) => rev !== v) : [...selectedValues, v];
      (onChange as (value: T[], prev: T[]) => void)(next, selectedValues);
      resetSearch();
    } else {
      (onChange as (value: T, prev: T) => void)(v, selectedValues[0]);
      close();
    }
  };
  const onClear = () => {
    if (multiple) (onChange as (value: T[], prev: T[]) => void)([], selectedValues);
    else (onChange as (value: T | null, prev: T | null) => void)(null, selectedValues[0]);
    close();
  };
  const commit = (idx: number) => {
    const row = rows[idx];
    if (row === undefined) close();
    else if (row === null) onClear();
    else onSelect(row.value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "Tab") {
      if (isOpen) close();
      return;
    }
    if (e.key === "Escape") {
      if (!isOpen) return;
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIdx(e.key === "ArrowUp" ? rows.length - 1 : 0);
      } else if (rows.length) setActiveIdx(clamp(activeIdx + (e.key === "ArrowDown" ? 1 : -1), 0, rows.length - 1));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      if (!isOpen || !rows.length) return;
      e.preventDefault();
      setActiveIdx(e.key === "Home" ? 0 : rows.length - 1);
      return;
    }
    // Space commits only where it is not text: a searchable field has to be able to type one.
    if (e.key !== "Enter" && !(e.key === " " && !searchable)) return;
    e.preventDefault();
    if (!isOpen) {
      setIsOpen(true);
      setActiveIdx(0);
    } else commit(activeIdx);
  };
  const debouncedOnSearch = useDebounce(
    (text: string) => {
      if (text) onSearch?.(text);
    },
    [searchText],
    300,
  );

  useEffect(() => {
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    else document.removeEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    setSearchOptions(labeledOptions);
  }, [labeledOptions]);

  useEffect(() => {
    if (isOpen) onOpen?.();
  }, [isOpen]);

  useEffect(() => {
    setActiveIdx(-1);
  }, [rows]);

  useEffect(() => {
    if (!isOpen || activeIdx < 0) return;
    optionsRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, isOpen]);

  return (
    <div {...agentAttrs(onChange)} className={cn("relative min-w-[150px]", className)} ref={dropdownRef}>
      {label ? <Label className={labelClassName} label={label} desc={desc} nullable={nullable} /> : null}
      <div
        ref={fieldRef}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-disabled={disabled}
        aria-activedescendant={isOpen && activeIdx >= 0 ? `${listId}-${activeIdx}` : undefined}
        tabIndex={disabled || searchable ? -1 : 0}
        data-open={isOpen}
        className={cn(
          "flex h-auto min-h-[40px] w-full cursor-pointer items-center rounded-field border border-input px-0 py-1 pr-5 pl-1 focus:outline-hidden",
          "bg-background focus-visible:border-primary data-[open=true]:border-primary",
          disabled && "pointer-events-none opacity-50",
          selectClassName,
          isOpen && "border-border",
        )}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (disabled) return;
          if (isOpen) close();
          else setIsOpen(true);
        }}
      >
        <span className="flex w-full flex-wrap items-center gap-1">
          {multiple
            ? selectedValues.map((v, index) => {
                // Off the value: options can lag behind it or never carry it, and dropping the chip blanks the field.
                const optionValue = labeledOptions.find((option) => option.value === v);
                return (
                  <div
                    key={index}
                    className="flex items-center gap-2 rounded-field bg-primary px-2 py-1 text-primary-foreground text-xs"
                  >
                    {renderSelected ? renderSelected(v) : (optionValue?.label ?? String(v))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onSelect(v);
                      }}
                      className="opacity-50 duration-300 hover:opacity-100"
                    >
                      <BiX className="text-base" />
                    </button>
                  </div>
                );
              })
            : null}
          {!multiple && hasSelection ? (
            <div className="px-2 py-1">
              {(() => {
                // Off the whole list, not the filtered one: typing a search must not blank out what is selected.
                const optionValue = labeledOptions.find((option) => selected(option.value));
                const v = selectedValues[0] as T;
                return renderSelected ? renderSelected(v) : (optionValue?.label ?? String(v));
              })()}
            </div>
          ) : null}
          {!hasSelection && !searchable && placeholder ? (
            <span className="px-2 py-1 text-muted-foreground">{placeholder}</span>
          ) : null}
          {searchable ? (
            <input
              type="text"
              aria-autocomplete="list"
              className="w-full flex-1 border-none bg-transparent shadow-none outline-none focus:border-none focus:shadow-none focus:outline-none"
              placeholder={hasSelection ? "" : placeholder}
              value={searchText}
              onChange={(e) => {
                if (!isOpen) setIsOpen(true);
                if (!onSearch) {
                  setSearchOptions(
                    labeledOptions.filter((option) =>
                      option.label.toString().toLowerCase().includes(e.target.value.toLowerCase()),
                    ),
                  );
                }
                setSearchText(e.target.value);
                debouncedOnSearch(e.target.value);
              }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsOpen(!isOpen);
              }}
            />
          ) : null}
        </span>
        {nullable && hasSelection ? (
          <TiDelete
            className="absolute right-8 z-2 h-full text-lg duration-300 hover:cursor-pointer hover:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onClear();
            }}
          />
        ) : null}
        <BiChevronDown
          className={cn("absolute top-1/2 right-2 -translate-y-1/2 text-lg duration-100", isOpen && "rotate-180")}
        />
      </div>
      {portal
        ? createPortal(
            <div
              ref={optionsRef}
              id={listId}
              role="listbox"
              aria-multiselectable={multiple}
              aria-hidden={!isOpen}
              {...overlayLayerProps}
              data-open={isOpen}
              // Inline: a computed position cannot be a class.
              style={{
                position: "fixed",
                zIndex: overlayZ.select,
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                width: position?.anchorWidth,
                visibility: position ? undefined : "hidden",
              }}
              className={cn(
                "scrollbar-thin scrollbar-thumb-foreground/20 scrollbar-track scrollbar-track-foreground/40 overflow-y-auto rounded-box border border-border bg-popover text-popover-foreground shadow-lg",
                // max-height because height cannot ease to `auto`; easing anything else would lag the fixed
                // top/left behind the field on scroll.
                "origin-center transition-[max-height] duration-200 data-[open=false]:max-h-0 data-[open=true]:max-h-[270px] data-[open=true]:border data-[open=false]:border-none",
                selectorClassName,
              )}
            >
              {rows.map((row, idx) => {
                const isSelected = row ? selected(row.value) : !hasSelection;
                return (
                  <div key={idx} className="group">
                    <div
                      id={`${listId}-${idx}`}
                      role="option"
                      aria-selected={isSelected}
                      data-idx={idx}
                      data-active={idx === activeIdx}
                      className={cn(
                        "relative mx-1 my-0.5 cursor-pointer rounded-field p-2 transition-colors last:border-b-0 hover:bg-muted data-[active=true]:bg-muted",
                        !row && "text-foreground/50",
                        !multiple && isSelected && selectedClassName,
                        isSelected && "bg-success/70 text-success-foreground",
                      )}
                      onClick={() => {
                        commit(idx);
                      }}
                    >
                      {row
                        ? renderOption
                          ? renderOption(row.value)
                          : row.label
                        : (placeholder ?? l("base.noSelection"))}
                      <div className="absolute top-1/2 right-2 -translate-y-1/2 flex-wrap duration-200">
                        <div
                          className={cn(
                            "duration-200",
                            isSelected ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0",
                          )}
                        >
                          <BiCheck />
                        </div>
                      </div>
                    </div>
                    <div className="h-px w-full px-2 group-last:hidden">
                      <div className="size-full bg-foreground/10" />
                    </div>
                  </div>
                );
              })}
              {searchOptions.length ? null : loading ? (
                <div className="flex size-full items-center justify-center p-4">
                  <LoadingSpin />
                </div>
              ) : (
                (empty ?? (
                  <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-5xl text-foreground/50">
                    <BsQuestionCircleFill />
                    <div className="text-sm">{l("base.noOptions")}</div>
                  </div>
                ))
              )}
            </div>,
            portal,
          )
        : null}
    </div>
  );
};

// Written out rather than `createOverridable`, so `<Select<MyEnum, true> …/>` still infers.
export const Select = <
  T extends string | number | boolean | null | undefined,
  Multiple extends boolean = false,
  Searchable extends boolean = false,
  Option extends Options<T> = Options<T>,
>(
  props: SelectProps<T, Multiple, Searchable, Option>,
) => {
  const Override = useUiOverride("Select");
  const Impl = (Override ?? DefaultSelect) as unknown as ComponentType<SelectProps<T, Multiple, Searchable, Option>>;
  return createElement(Impl, props);
};
