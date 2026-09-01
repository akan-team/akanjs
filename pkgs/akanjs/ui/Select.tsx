"use client";
import { type Cls, type EnumInstance, isEnum } from "akanjs/base";
import { cn, usePage } from "akanjs/client";
import { useFieldTool } from "akanjs/store";
import { useDebounce } from "akanjs/webkit";
import { type ComponentType, createElement, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiCheck, BiChevronDown, BiX } from "react-icons/bi";
import { BsQuestionCircleFill } from "react-icons/bs";
import { TiDelete } from "react-icons/ti";
import { agentAttrs } from "./agentAttrs";
import { overlayZ, useOverlayLayerProps } from "./overlayLayer";
import { useOverlayPosition } from "./overlayPosition";
import { useUiOverride } from "./UiOverride";

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
  /** Optional label shown above the selector. */
  label?: string;
  /** Optional tooltip/help description next to the label. */
  desc?: string;
  labelClassName?: string;
  className?: string;
  /** Controlled selected value, or selected values when multiple is true. */
  value: Multiple extends true ? T[] : T;
  /** Option values, label/value pairs, or an Akan enum instance. */
  options: Searchable extends true ? (T extends string ? Option : LabelOption<T>[]) : Option;
  /** Enable selecting multiple values. */
  multiple?: Multiple;
  /** Enable search input inside the selector. */
  searchable?: Searchable;
  placeholder?: string;
  selectClassName?: string;
  selectorClassName?: string;
  selectedClassName?: string;
  /** Allow no value to be selected. */
  nullable?: boolean;
  /** Disable open and selection behavior. */
  disabled?: boolean;
  /** Called when the dropdown opens. */
  onOpen?: () => void;
  /** Controlled change callback. Receives next and previous value. */
  onChange: Multiple extends true ? (value: T[], prev: T[]) => void : (value: T, prev: T) => void;
  /** Optional remote/local search callback. */
  onSearch?: (text: string) => void;
  /** Custom option renderer. */
  renderOption?: (value: T) => ReactNode;
  /** Custom selected value renderer. */
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
  multiple,
  searchable,
  placeholder,
  selectClassName,
  selectorClassName,
  selectedClassName,
  onOpen,
  onChange,
  onSearch,
  renderOption,
  renderSelected,
}: SelectProps<T, Multiple, Searchable, Option>) => {
  useFieldTool(onChange, { disabled });
  const { l } = usePage();
  const [isOpen, setIsOpen] = useState(false);
  const labeledOptions: { label: string | boolean | number; value: T }[] = useMemo(
    () =>
      isEnum(options as Cls)
        ? (options as EnumInstance<string, T>).values.map((v) => ({
            label: typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v),
            value: v,
          }))
        : (options as { label?: string | boolean | number; value?: T }[])[0]?.label &&
            (options as { label?: string | boolean | number; value?: T }[])[0]?.value
          ? (options as { label: string | boolean | number; value: T }[])
          : (options.map((v: unknown) => ({ label: v as string | boolean | number, value: v as T })) as {
              label: string | boolean | number;
              value: T;
            }[]),
    [options],
  );

  const [selectedValues, setSelectedValues] = useState<T[]>(multiple ? (value as T[]) : [value as T]);
  const [searchText, setSearchText] = useState("");
  // Resolved in an effect rather than at render: the first client pass has to match the server's, which
  // portalled nothing. The panel is mounted while closed, so a render-time `typeof document` branch would
  // hand hydration an extra node on every SSR page that renders a Select.
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [searchOptions, setSearchOptions] = useState<{ label: ReactNode; value: T }[]>(labeledOptions);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  // Read through the portal-to-be: whichever dismissable scope rendered this field owns its options.
  const overlayLayerProps = useOverlayLayerProps();
  const position = useOverlayPosition({
    opened: isOpen,
    triggerRef: dropdownRef,
    panelRef: optionsRef,
    align: "start",
  });

  const selected = (v: T) => {
    if (multiple) return selectedValues.includes(v);
    return v === selectedValues[0];
  };

  const handleClickOutside = (event: Event) => {
    const target = event.target as Node;
    // The options portal out of this subtree, so the field alone is no longer the whole of "inside".
    if (optionsRef.current?.contains(target)) return;
    if (dropdownRef.current && !dropdownRef.current.contains(target)) {
      setIsOpen(false);
    }
  };
  const onSelect = (v: T, index: number) => {
    if (multiple) {
      if (selectedValues.includes(v)) {
        setSelectedValues(selectedValues.filter((rev) => rev !== v));
        (onChange as (value: T[], prev: T[]) => void)(
          selectedValues.filter((rev) => rev !== v),
          selectedValues,
        );
      } else {
        setSelectedValues([...selectedValues, v]);
        (onChange as (value: T[], prev: T[]) => void)([...selectedValues, v], selectedValues);
      }
    } else {
      setSelectedValues([v]);
      (onChange as (value: T, prev: T) => void)(v, selectedValues[0]);
      setIsOpen(false);
    }
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
    setPortal(document.body);
  }, []);

  useEffect(() => {
    setSearchOptions(labeledOptions);
  }, [labeledOptions]);

  useEffect(() => {
    if (isOpen) onOpen?.();
  }, [isOpen]);

  useEffect(() => {
    if (multiple) setSelectedValues(value as T[]);
    else setSelectedValues([value as T]);
  }, [value]);

  return (
    <div {...agentAttrs(onChange)} className={cn("relative min-w-[150px]", className)} ref={dropdownRef}>
      <div
        data-open={isOpen}
        className={cn(
          "flex h-auto min-h-[40px] w-full cursor-pointer items-center rounded-field border border-input px-0 py-1 pr-5 pl-1 focus:outline-hidden",
          "bg-background data-[open=true]:border-primary",
          disabled && "pointer-events-none opacity-50",
          selectClassName,
          isOpen && "border-border",
        )}
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
        }}
      >
        <span className="flex w-full flex-wrap items-center gap-1">
          {multiple ? (
            (value as T[]).map((v, index) => {
              const optionValue = labeledOptions.find((option) => option.value === v);
              if (!optionValue) return null;
              return (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-field bg-primary px-2 py-1 text-primary-foreground text-xs"
                >
                  {renderSelected ? renderSelected(optionValue.value) : optionValue.label}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onSelect(optionValue.value, index);
                    }}
                    className="opacity-50 duration-300 hover:opacity-100"
                  >
                    <BiX className="text-base" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="px-2 py-1">
              {(value as T)
                ? (() => {
                    const optionValue = searchOptions.find((option) => selected(option.value));
                    if (!optionValue) return null;
                    return renderSelected ? renderSelected(optionValue.value) : optionValue.label;
                  })()
                : ""}
            </div>
          )}
          {searchable ? (
            <input
              type="text"
              className="w-full flex-1 border-none bg-transparent shadow-none outline-none focus:border-none focus:shadow-none focus:outline-none"
              placeholder={selectedValues.length > 0 ? "" : placeholder}
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
        {(multiple && selectedValues.length) ||
        (!multiple && selectedValues[0] !== undefined && (selectedValues[0] as T) !== null) ? (
          <TiDelete
            className="absolute right-8 z-2 h-full text-lg duration-300 hover:cursor-pointer hover:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setSearchText("");
              setSelectedValues([]);
              if (multiple) (onChange as (value: T[], prev: T[]) => void)([], selectedValues);
              else (onChange as (value: T | null, prev: T | null) => void)(null, selectedValues[0]);
              setIsOpen(false);
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
              {...overlayLayerProps}
              data-open={isOpen}
              // Inline, because a computed position cannot be a class. The width follows the field, which is
              // what `w-full` did while the panel still lived inside it.
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
                // Animated through max-height, not height: `height` cannot ease to `auto`, so a fixed open
                // height was the only way to animate — and it left a short list padded out with dead space.
                // Only that property eases: `transition-all` would ease the computed top/left as well, and
                // the panel would lag behind its field on every scroll.
                "origin-center transition-[max-height] duration-200 data-[open=false]:max-h-0 data-[open=true]:max-h-[270px] data-[open=true]:border data-[open=false]:border-none",
                selectorClassName,
              )}
            >
              {nullable && (
                <div
                  className="cursor-pointer p-2"
                  onClick={() => {
                    setIsOpen(false);
                  }}
                />
              )}
              {searchOptions.length > 0 ? (
                searchOptions.map((option, index) => {
                  const isSelected = selected(option.value);
                  return (
                    <div key={index} className="group">
                      <div
                        className={cn(
                          "relative mx-1 my-0.5 cursor-pointer rounded-field p-2 transition-colors last:border-b-0 hover:bg-muted",
                          !multiple && isSelected && selectedClassName,
                          isSelected && "bg-success/70 text-success-foreground",
                        )}
                        onClick={() => {
                          onSelect(option.value, index);
                          setSearchText("");
                        }}
                      >
                        {/* {option.label} */}
                        {renderOption ? renderOption(option.value) : option.label}
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
                })
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-5xl text-foreground/50">
                  <BsQuestionCircleFill />
                  <div className="text-sm">{l("base.noOptions")}</div>
                </div>
              )}
            </div>,
            portal,
          )
        : null}
    </div>
  );
};

/**
 * Select. Resolves to a route-scoped override when a `page/**\/_overrides.tsx` in the route's
 * ancestry declares one, otherwise renders {@link DefaultSelect}. The public generic signature is
 * preserved, so `<Select<MyEnum, true> …/>` still infers the value/onChange shape.
 */
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
