"use client";
// /* eslint-disable @akanjs/lint/useClientByFile */
// /* eslint-disable @typescript-eslint/no-unsafe-return */
// /* eslint-disable @typescript-eslint/no-unsafe-assignment */
// /* eslint-disable @typescript-eslint/no-unsafe-member-access */
// /* eslint-disable @typescript-eslint/no-unsafe-argument */
import { EnumInstance, isEnum, Type } from "@akanjs/base";
import { clsx, usePage } from "@akanjs/client";
import { useDebounce } from "@akanjs/next";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { BiCheck, BiChevronDown, BiX } from "react-icons/bi";
import { BsQuestionCircleFill } from "react-icons/bs";
import { TiDelete } from "react-icons/ti";

interface LabelOption<T> {
  label: string | boolean | number;
  value: T;
}
type Options<T> = T[] | LabelOption<T>[] | EnumInstance<string, T>;

interface SelectProps<
  T extends string | number | boolean | null | undefined,
  Multiple extends boolean = false,
  Searchable extends boolean = false,
  Option extends Options<T> = Options<T>,
> {
  label?: string;
  desc?: string;
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
  nullable?: boolean;
  disabled?: boolean;
  onOpen?: () => void;
  onChange: Multiple extends true ? (value: T[], prev: T[]) => void : (value: T, prev: T) => void;
  onSearch?: (text: string) => void;
  renderOption?: (value: T) => ReactNode;
  renderSelected?: (value: T) => ReactNode;
}

export const Select = <
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
  const { l } = usePage();
  const [isOpen, setIsOpen] = useState(false);
  const labeledOptions: { label: string | boolean | number; value: T }[] = useMemo(
    () =>
      isEnum(options as Type)
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
    [options]
  );

  const [selectedValues, setSelectedValues] = useState<T[]>(multiple ? (value as T[]) : [value as T]);
  const [searchText, setSearchText] = useState("");
  const [searchOptions, setSearchOptions] = useState<{ label: ReactNode; value: T }[]>(labeledOptions);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = (v: T) => {
    if (multiple) return selectedValues.includes(v);
    return v === selectedValues[0];
  };

  const handleClickOutside = (event: Event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };
  const onSelect = (v: T, index: number) => {
    if (multiple) {
      if (selectedValues.includes(v)) {
        setSelectedValues(selectedValues.filter((rev) => rev !== v));
        (onChange as (value: T[], prev: T[]) => void)(
          selectedValues.filter((rev) => rev !== v),
          selectedValues
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
    300
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
    if (multiple) setSelectedValues(value as T[]);
    else setSelectedValues([value as T]);
  }, [value]);

  return (
    <div className={clsx("relative min-w-[150px]", className)} ref={dropdownRef}>
      <div
        data-open={isOpen}
        className={clsx(
          "btn flex h-auto min-h-[40px] w-full cursor-pointer items-center px-0 py-1 pr-5 pl-1 focus:outline-hidden",
          "bg-base-100 data-[open=true]:border-primary",
          disabled && "pointer-events-none opacity-50",
          selectClassName,
          { "border-base-300": isOpen }
        )}
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
        }}
      >
        <span className="flex w-full flex-wrap items-center gap-1">
          {multiple ? (
            <>
              {(value as T[]).map((v, index) => {
                const optionValue = labeledOptions.find((option) => option.value === v);
                if (!optionValue) return null;
                return (
                  <div
                    key={index}
                    className="bg-success/70 text-success-content flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
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
              })}
            </>
          ) : (
            <div className="px-2 py-1">
              {(value as T) ? (
                <>
                  {(() => {
                    const optionValue = searchOptions.find((option) => selected(option.value));
                    if (!optionValue) return null;
                    return renderSelected ? renderSelected(optionValue.value) : optionValue.label;
                  })()}
                </>
              ) : (
                ""
              )}
            </div>
          )}
          {searchable ? (
            <input
              type="text"
              className="input w-full flex-1 border-none bg-transparent shadow-none outline-none focus:border-none focus:shadow-none focus:outline-none"
              placeholder={selectedValues.length > 0 ? "" : placeholder}
              value={searchText}
              onChange={(e) => {
                if (!isOpen) setIsOpen(true);
                if (!onSearch) {
                  setSearchOptions(
                    labeledOptions.filter((option) =>
                      option.label.toString().toLowerCase().includes(e.target.value.toLowerCase())
                    )
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
            className="absolute right-8 z-[2] h-full text-lg duration-300 hover:cursor-pointer hover:opacity-50"
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
          className={clsx("absolute top-1/2 right-2 -translate-y-1/2 text-lg duration-100", { "rotate-180": isOpen })}
        />
      </div>
      <div
        data-open={isOpen}
        className={clsx(
          "scrollbar-thin scrollbar-thumb-base-content/20 scrollbar-track scrollbar-track-base-content/40 bg-base-200 border-base-300 absolute z-20 mt-0.5 w-full overflow-y-scroll rounded-md shadow-lg transition-all",
          "origin-center duration-200 data-[open=false]:h-0 data-[open=false]:border-none data-[open=true]:h-[270px] data-[open=true]:border",
          selectorClassName
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
          <>
            {searchOptions.map((option, index) => {
              const isSelected = selected(option.value);
              return (
                <div key={index} className="group">
                  <div
                    className={clsx(
                      "hover:bg-base-300 relative m-2 cursor-pointer rounded-sm p-2 duration-100 last:border-b-0",
                      {
                        selectedClassName: !multiple && isSelected,
                        "bg-success/70 text-success-content": isSelected,
                      }
                    )}
                    onClick={() => {
                      onSelect(option.value, index);
                      setSearchText("");
                    }}
                  >
                    {/* {option.label} */}
                    {renderOption ? renderOption(option.value) : option.label}
                    <div className={clsx("absolute top-1/2 right-2 -translate-y-1/2 flex-wrap duration-200", {})}>
                      <div
                        className={clsx("duration-200", {
                          "translate-y-0 opacity-100": isSelected,
                          "-translate-y-full opacity-0": !isSelected,
                        })}
                      >
                        <BiCheck />
                      </div>
                    </div>
                  </div>
                  <div className="h-px w-full px-2 group-last:hidden">
                    <div className="bg-base-content/10 size-full" />
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="text-base-content/50 flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-5xl">
            <BsQuestionCircleFill />
            <div className="text-sm">{l("base.noOptions")}</div>
          </div>
        )}
      </div>
    </div>
  );
};
