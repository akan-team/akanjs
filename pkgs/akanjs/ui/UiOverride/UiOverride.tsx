"use client";
import { type ComponentType, createElement, type ReactNode, useContext, useMemo } from "react";
import type { ClassNameValue as ClassValue } from "tailwind-merge";
import { sharedContext } from "../../client/sharedContext";
import type { ApprovalProps as AgentApprovalProps } from "../Agent/Approval";
import type { BubbleProps as AgentBubbleProps } from "../Agent/Bubble";
import type { ChatProps as AgentChatProps } from "../Agent/Chat";
import type { ComposerProps as AgentComposerProps } from "../Agent/Composer";
import type { LauncherProps as AgentLauncherProps } from "../Agent/Launcher";
import type { CodeProps as AgentCodeProps, MarkdownProps as AgentMarkdownProps } from "../Agent/Markdown";
import type { MenuProps as AgentMenuProps } from "../Agent/Menu";
import type { QuestionProps as AgentQuestionProps } from "../Agent/Question";
import type { QueuedProps as AgentQueuedProps } from "../Agent/Queued";
import type { StepsProps as AgentStepsProps } from "../Agent/Steps";
import type { ToolCardProps as AgentToolCardProps } from "../Agent/ToolCard";
import type { ToolRowProps as AgentToolRowProps } from "../Agent/ToolRow";
import type { BadgeProps } from "../Badge";
import type { ButtonProps } from "../Button";
import type { DatePickerProps, RangePickerProps, TimePickerProps } from "../DatePicker";
import type { DropdownProps } from "../Dropdown";
import type { EmptyProps } from "../Empty";
import type { CheckboxProps, EmailProps, InputProps, NumberProps, PasswordProps, TextAreaProps } from "../Input";
import type { ProgressBarProps } from "../Loading/ProgressBar";
import type { SkeletonProps } from "../Loading/Skeleton";
import type { AreaProps, SpinProps } from "../Loading/Spin";
import type { MenuProps } from "../Menu";
import type { ModalProps } from "../Modal";
import type { DraftBarViewProps } from "../Model/DraftBar";
import type { PaginationProps } from "../Pagination";
import type { PopconfirmProps } from "../Popconfirm";
import type { ItemProps as RadioItemProps, RadioProps } from "../Radio";
import type { BadgeVariants, ButtonVariants, InputSurfaceVariants } from "../recipe";
import type { SelectProps } from "../Select";
import type { TableProps } from "../Table";
import type { ToastItemProps, ToastProps } from "../Toast";
import type { MultiProps as ToggleSelectMultiProps, ToggleSelectProps } from "../ToggleSelect";
import type { TooltipProps } from "../Tooltip";
import type { UnauthorizedProps } from "../Unauthorized";

/** Components a `page/**\/_overrides.tsx` manifest may replace, each typed to its public prop contract. */
export interface AkanUiOverrides {
  Badge: ComponentType<BadgeProps>;
  Modal: ComponentType<ModalProps>;
  Empty: ComponentType<EmptyProps>;
  Pagination: ComponentType<PaginationProps>;
  Popconfirm: ComponentType<PopconfirmProps>;
  Dropdown: ComponentType<DropdownProps>;
  Table: ComponentType<TableProps>;
  Menu: ComponentType<MenuProps>;
  Tooltip: ComponentType<TooltipProps>;
  Unauthorized: ComponentType<UnauthorizedProps>;
  DraftBar: ComponentType<DraftBarViewProps>;
  AgentChat: ComponentType<AgentChatProps>;

  // `AgentChat` replaces the panel, these what it renders; `AgentSteps` is one turn (between two user messages).
  AgentLauncher: ComponentType<AgentLauncherProps>;
  AgentBubble: ComponentType<AgentBubbleProps>;
  AgentSteps: ComponentType<AgentStepsProps>;
  AgentComposer: ComponentType<AgentComposerProps>;
  AgentApproval: ComponentType<AgentApprovalProps>;
  AgentQuestion: ComponentType<AgentQuestionProps>;
  AgentQueued: ComponentType<AgentQueuedProps>;
  AgentMenu: ComponentType<AgentMenuProps>;
  AgentMarkdown: ComponentType<AgentMarkdownProps>;
  AgentToolCard: ComponentType<AgentToolCardProps>;
  AgentToolRow: ComponentType<AgentToolRowProps>;
  AgentCode: ComponentType<AgentCodeProps>;

  // Generic components: the slot stores the widest instantiation; the public export keeps its generics.
  Button: ComponentType<ButtonProps<unknown>>;
  Select: ComponentType<SelectProps<string | number | boolean | null | undefined>>;

  Input: ComponentType<InputProps>;
  InputTextArea: ComponentType<TextAreaProps>;
  InputPassword: ComponentType<PasswordProps>;
  InputEmail: ComponentType<EmailProps>;
  InputNumber: ComponentType<NumberProps>;
  InputCheckbox: ComponentType<CheckboxProps>;

  Radio: ComponentType<RadioProps>;
  RadioItem: ComponentType<RadioItemProps>;

  DatePicker: ComponentType<DatePickerProps>;
  DatePickerRangePicker: ComponentType<RangePickerProps>;
  DatePickerTimePicker: ComponentType<TimePickerProps>;

  Toast: ComponentType<ToastProps>;
  ToastItem: ComponentType<ToastItemProps>;

  ToggleSelect: ComponentType<ToggleSelectProps<string | number | boolean | null>>;
  ToggleSelectMulti: ComponentType<ToggleSelectMultiProps>;

  LoadingSpin: ComponentType<SpinProps>;
  LoadingSkeleton: ComponentType<SkeletonProps>;
  LoadingProgressBar: ComponentType<ProgressBarProps>;
  LoadingButton: ComponentType<SkeletonProps>;
  LoadingInput: ComponentType<SkeletonProps>;
  LoadingArea: ComponentType<AreaProps>;
}

export type AkanUiOverrideName = keyof AkanUiOverrides;

/** Prop contract an app-authored Modal override must satisfy. */
export type AkanModalComponent = AkanUiOverrides["Modal"];

/** Recipe slots `override({ recipes })` may swap: a client-side, route-scoped restyle that reaches framework client
 *  components only, never a raw `xRecipe()` call or a server component. */
export interface AkanUiRecipes {
  button: (variants?: ButtonVariants, className?: ClassValue) => string;
  badge: (variants?: BadgeVariants, className?: ClassValue) => string;
  input: (variants?: InputSurfaceVariants, className?: ClassValue) => string;
}

/** Shape of an `_overrides.tsx` manifest: component slots plus an optional recipe-slot map. */
export type AkanUiOverrideManifest = Partial<AkanUiOverrides> & { recipes?: Partial<AkanUiRecipes> };

export const UiOverrideContext = sharedContext<AkanUiOverrideManifest>("uiOverride", {});

/** The active override for `name` in this route subtree, or `undefined`. */
export const useUiOverride = <K extends keyof AkanUiOverrides>(name: K): AkanUiOverrides[K] | undefined => {
  // Untyped read: materializing `Partial<AkanUiOverrides>[K]` over the generic slots trips TS2590.
  const overrides = useContext(UiOverrideContext) as Record<string, unknown>;
  return overrides[name] as AkanUiOverrides[K] | undefined;
};

/** The active recipe swap for `name` in this route subtree, or `undefined`. */
export const useUiRecipe = <K extends keyof AkanUiRecipes>(name: K): AkanUiRecipes[K] | undefined => {
  const { recipes } = useContext(UiOverrideContext);
  return recipes?.[name];
};

/** Renders the nearest `_overrides.tsx` entry for `name`, else `Default`. */
export const createOverridable = <K extends keyof AkanUiOverrides>(
  name: K,
  Default: AkanUiOverrides[K],
): AkanUiOverrides[K] => {
  // Narrowed before `??`: the deferred union `AkanUiOverrides[K]` would otherwise trip TS2590.
  const Fallback = Default as unknown as ComponentType<Record<string, unknown>>;
  const Overridable = (props: Record<string, unknown>): ReactNode => {
    const Override = useUiOverride(name) as unknown as ComponentType<Record<string, unknown>> | undefined;
    return createElement(Override ?? Fallback, props);
  };
  return Overridable as unknown as AkanUiOverrides[K];
};

export interface UiOverrideProviderProps {
  value?: AkanUiOverrideManifest;
  children?: ReactNode;
}

/** Merges `value` over the inherited overrides (closest wins; `recipes` merges per slot). */
export const UiOverrideProvider = ({ value, children }: UiOverrideProviderProps) => {
  const parent = useContext(UiOverrideContext);
  const merged = useMemo(
    () => ({ ...parent, ...value, recipes: { ...parent.recipes, ...value?.recipes } }),
    [parent, value],
  );
  return <UiOverrideContext.Provider value={merged}>{children}</UiOverrideContext.Provider>;
};
