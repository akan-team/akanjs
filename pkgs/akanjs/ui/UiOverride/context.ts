"use client";
import { type ComponentType, createContext } from "react";

import type { ButtonProps } from "../Button";
import type { DatePickerProps, RangePickerProps, TimePickerProps } from "../DatePicker";
import type { DropdownProps } from "../Dropdown";
import type { EmptyProps } from "../Empty";
import type { CheckboxProps, EmailProps, InputProps, NumberProps, PasswordProps, TextAreaProps } from "../Input";
import type { LoadingProps as LoadingButtonProps } from "../Loading/Button";
import type { LoadingProps as LoadingInputProps } from "../Loading/Input";
import type { ProgressBarProps } from "../Loading/ProgressBar";
import type { SkeletonProps } from "../Loading/Skeleton";
import type { SpinProps } from "../Loading/Spin";
import type { MenuProps } from "../Menu";
import type { ModalProps } from "../Modal";
import type { PaginationProps } from "../Pagination";
import type { PopconfirmProps } from "../Popconfirm";
import type { ItemProps as RadioItemProps, RadioProps } from "../Radio";
import type { SelectProps } from "../Select";
import type { TableProps } from "../Table";
import type { MultiProps as ToggleSelectMultiProps, ToggleSelectProps } from "../ToggleSelect";
import type { UnauthorizedProps } from "../Unauthorized";

/**
 * Registry of framework UI components an app may replace per-route through a
 * `page/**\/_overrides.tsx` manifest. Each entry is keyed by the framework
 * component name and typed to that component's public prop contract, so an
 * override is checked as a drop-in replacement.
 *
 * Extend this interface (and add a matching `createOverridable(...)` call in the
 * component file) to make another component overridable. Generic components
 * (e.g. `Button`, `Select`) and compound components that carry static
 * sub-components (e.g. `Tab`, `Field`, `Input`) need dedicated slot support
 * before they can be listed here without losing call-site typing.
 */
export interface AkanUiOverrides {
  // Leaf primitives — plain drop-in components.
  Modal: ComponentType<ModalProps>;
  Empty: ComponentType<EmptyProps>;
  Pagination: ComponentType<PaginationProps>;
  Popconfirm: ComponentType<PopconfirmProps>;
  Dropdown: ComponentType<DropdownProps>;
  Table: ComponentType<TableProps>;
  Menu: ComponentType<MenuProps>;
  Unauthorized: ComponentType<UnauthorizedProps>;

  // Generic components. The public export keeps its full generic signature; the slot stores the widest
  // instantiation, so an override is authored against that erased prop type without touching generics.
  Button: ComponentType<ButtonProps<unknown>>;
  Select: ComponentType<SelectProps<string | number | boolean | null | undefined>>;

  // Compound `Input` — one slot per leaf (base + statics), reassembled with Object.assign in Input.tsx.
  Input: ComponentType<InputProps>;
  InputTextArea: ComponentType<TextAreaProps>;
  InputPassword: ComponentType<PasswordProps>;
  InputEmail: ComponentType<EmailProps>;
  InputNumber: ComponentType<NumberProps>;
  InputCheckbox: ComponentType<CheckboxProps>;

  // Compound `Radio`.
  Radio: ComponentType<RadioProps>;
  RadioItem: ComponentType<RadioItemProps>;

  // Compound `DatePicker`.
  DatePicker: ComponentType<DatePickerProps>;
  DatePickerRangePicker: ComponentType<RangePickerProps>;
  DatePickerTimePicker: ComponentType<TimePickerProps>;

  // `ToggleSelect` — generic base (widest instantiation) plus the `.Multi` leaf.
  ToggleSelect: ComponentType<ToggleSelectProps<string | number | boolean | null>>;
  ToggleSelectMulti: ComponentType<ToggleSelectMultiProps>;

  // `Loading` — a namespace object of independent members, each its own slot.
  LoadingSpin: ComponentType<SpinProps>;
  LoadingSkeleton: ComponentType<SkeletonProps>;
  LoadingProgressBar: ComponentType<ProgressBarProps>;
  LoadingButton: ComponentType<LoadingButtonProps>;
  LoadingInput: ComponentType<LoadingInputProps>;
  LoadingArea: ComponentType<Record<string, never>>;
}

export type AkanUiOverrideName = keyof AkanUiOverrides;

/** Prop contract an app-authored Modal override must satisfy. */
export type AkanModalComponent = AkanUiOverrides["Modal"];

/**
 * Holds the override map for the current route subtree. Empty at the root, then
 * merged (child wins) by each nested `UiOverrideProvider`, mirroring how nested
 * `_layout.tsx` / `_overrides.tsx` stack down the route tree.
 */
export const UiOverrideContext = createContext<Partial<AkanUiOverrides>>({});
