# `akanjs/ui/UiOverride/UiOverride.tsx`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type AkanModalComponent = AkanUiOverrides["Modal"];

export type AkanUiOverrideManifest = Partial<AkanUiOverrides> & {
    recipes?: Partial<AkanUiRecipes>;
};

export type AkanUiOverrideName = keyof AkanUiOverrides;

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
    AgentCode: ComponentType<AgentCodeProps>;
    Button: ComponentType<ButtonProps<unknown>>;
    Select: ComponentType<SelectProps<boolean | null | number | string | undefined>>;
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
    ToggleSelect: ComponentType<ToggleSelectProps<boolean | null | number | string>>;
    ToggleSelectMulti: ComponentType<ToggleSelectMultiProps>;
    LoadingSpin: ComponentType<SpinProps>;
    LoadingSkeleton: ComponentType<SkeletonProps>;
    LoadingProgressBar: ComponentType<ProgressBarProps>;
    LoadingButton: ComponentType<SkeletonProps>;
    LoadingInput: ComponentType<SkeletonProps>;
    LoadingArea: ComponentType<AreaProps>;
}

export interface AkanUiRecipes {
    button: (variants?: ButtonVariants, className?: ClassValue) => string;
    badge: (variants?: BadgeVariants, className?: ClassValue) => string;
    input: (variants?: InputSurfaceVariants, className?: ClassValue) => string;
}

export declare const UiOverrideContext: import("react").Context<AkanUiOverrideManifest>;

export declare const UiOverrideProvider: ({ value, children }: UiOverrideProviderProps) => import("react").JSX.Element;

export interface UiOverrideProviderProps {
    value?: AkanUiOverrideManifest;
    children?: ReactNode;
}

export declare const createOverridable: <K extends keyof AkanUiOverrides>(name: K, Default: AkanUiOverrides[K]) => AkanUiOverrides[K];

export declare const useUiOverride: <K extends keyof AkanUiOverrides>(name: K) => AkanUiOverrides[K] | undefined;

export declare const useUiRecipe: <K extends keyof AkanUiRecipes>(name: K) => AkanUiRecipes[K] | undefined;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface AreaProps {
    className?: string;
    indicator?: ReactNode;
    children?: ReactNode;
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & BadgeVariants;

// ui/Button
type ButtonProps<Result> = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & ButtonVariants & {
    onClick?: (e: React.MouseEvent<HTMLButtonElement>, { onError }: {
        onError: (error: string) => void;
    }) => Promise<Result> | Result;
    onSuccess?: (result: Result) => void;
    loadingMode?: "hold" | "replace";
    showError?: boolean;
};

// ui/Popconfirm
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
};

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
    className?: string;
    checked: boolean;
    onChange: (checked: boolean, e: ChangeEvent<HTMLInputElement>) => void;
};

interface Column {
    key?: string;
    title: ReactNode;
    dataIndex: string;
    render?: (text: any, record: any, idx: number) => React.ReactNode;
    responsive?: Responsive["value"][];
}

interface DatePickerProps {
    className?: string;
    value?: Dayjs | null;
    onChange: (value: Dayjs | null) => void;
    showTime?: boolean;
    min?: Dayjs | null;
    max?: Dayjs | null;
    disabledDate?: (date: Dayjs) => boolean | null | undefined;
    defaultValue?: Dayjs;
}

interface DraftBarViewProps {
    className?: string;
    refName: string;
    state: "applied" | "conflict";
    savedAt: Date;
    onRestore?: () => void;
    onDiscard: () => void;
}

interface DropdownProps {
    value?: ReactNode;
    trigger?: ReactNode;
    content: ReactNode;
    className?: string;
    buttonClassName?: string;
    dropdownClassName?: string;
    align?: "end" | "start";
    namespace?: string;
}

type EmailProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
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

interface EmptyProps {
    className?: string;
    icon?: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    minHeight?: number;
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
    inputStyleType?: "bordered" | "borderless" | "underline";
    inputRef?: RefObject<HTMLInputElement | null>;
    value: string;
    nullable?: boolean;
    icon?: React.ReactNode;
    iconClassName?: string;
    inputClassName?: string;
    inputWrapperClassName?: string;
    onPressEnter?: (value: any, event: KeyboardEvent<HTMLInputElement>) => void;
    validate?: (value: string) => boolean | string;
    onChange?: (value: string, e?: ChangeEvent<HTMLInputElement>) => void;
    onPressEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
};

interface ItemProps {
    value: number | string;
    children: ReactElement | ReactNode;
    className?: string;
    checked?: boolean;
    onChange?: (value: string) => void;
}

interface LabelOption<T> {
    label: boolean | number | string;
    value: T;
}

interface MenuItem {
    label: ReactNode;
    key: string;
    children?: MenuItem[];
    icon?: ReactNode;
    type?: string;
}

interface MenuProps {
    className?: string;
    ulClassName?: string;
    liClassName?: string;
    labelClassName?: (isActive: boolean) => string;
    style?: React.CSSProperties;
    selectedKeys?: string[];
    defaultSelectedKeys?: string[];
    mode?: "horizontal" | "inline";
    items: MenuItem[];
    onClick?: (item: MenuItem) => void;
    activeStyle?: string;
    inlineCollapsed?: boolean;
    onMouseOver?: () => void;
    onMouseLeave?: () => void;
    renderItem?: (item: MenuItem, active: boolean) => ReactNode;
}

interface ModalProps extends ModalSurfaceProps {
    className?: string;
    trigger?: ReactNode;
    title?: ReactNode | string;
    action?: ReactNode;
    closeButton?: ReactNode | false;
    open?: boolean;
    onCancel?: () => void;
    bodyClassName?: string;
    children?: ReactNode;
    confirmClose?: boolean;
}

interface MultiProps {
    className?: string;
    btnClassName?: string;
    items: number[] | string[] | {
        label: string;
        value: number | string;
        disabled?: boolean;
    }[];
    value: number[] | string[];
    nullable: boolean;
    validate: (value: number[] | string[]) => boolean | string;
    onChange: (value: number[] | string[]) => void;
    disabled?: boolean;
}

type NumberProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
    value: null | number;
    nullable?: boolean;
    icon?: React.ReactNode;
    iconClassName?: string;
    inputClassName?: string;
    inputWrapperClassName?: string;
    onPressEnter?: (value: any, event: KeyboardEvent<HTMLInputElement>) => void;
    onPressEscape?: (e: KeyboardEvent<HTMLInputElement>) => void;
    validate?: (value: null | number) => boolean | string;
    onChange: (value: null | number, e?: ChangeEvent<HTMLInputElement>) => void;
    numberFormat?: boolean;
    format?: (value: number) => string;
    formatter?: (value: string) => string;
    parser?: (value: string) => string;
};

type Options<T> = EnumInstance<string, T> | LabelOption<T>[] | T[];

interface PaginationProps {
    currentPage: number;
    total: number;
    onPageSelect: (page: number) => void;
    itemsPerPage: number;
    empty?: ReactNode;
    renderEmpty?: ReactNode;
    prev?: ReactNode;
    next?: ReactNode;
    ellipsis?: ReactNode;
    classNames?: {
        className?: string;
        activePageNumClassName?: string;
        pageNumClassName?: string;
    };
}

type PasswordProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
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

interface PopconfirmProps {
    title: ReactNode;
    description?: ReactNode;
    icon?: ReactNode | false;
    actions?: ReactNode;
    onConfirm?: () => void;
    okButtonProps?: ButtonProps;
    cancelButtonProps?: ButtonProps;
    okText?: ReactNode;
    cancelText?: ReactNode;
    children?: ReactNode;
    triggerClassName?: string;
    decoClassName?: string;
}

interface ProgressBarProps {
    className?: string;
    value: number;
    max: number;
}

interface RadioProps {
    value: null | number | string;
    className?: string;
    disabled?: boolean;
    children: ReactElement | ReactElement[] | ReactNode;
    onChange: (value: null | number | string, idx: number) => void;
}

interface RangePickerProps {
    className?: string;
    value: [
        Dayjs | null,
        Dayjs | null
    ];
    onChange: (value: [
        Dayjs | null,
        Dayjs | null
    ]) => void;
    showTime?: boolean;
    disabledDate?: (date: Dayjs) => boolean | null | undefined;
}

interface SelectProps<T extends boolean | null | number | string | undefined, Multiple extends boolean = false, Searchable extends boolean = false, Option extends Options<T> = Options<T>> {
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
    nullable?: boolean;
    disabled?: boolean;
    loading?: boolean;
    onOpen?: () => void;
    onChange: Multiple extends true ? (value: T[], prev: T[]) => void : (value: T, prev: T) => void;
    onSearch?: (text: string) => void;
    empty?: ReactNode;
    renderOption?: (value: T) => ReactNode;
    renderSelected?: (value: T) => ReactNode;
}

interface SkeletonProps {
    className?: string;
    active?: boolean;
    style?: CSSProperties;
}

interface SpinProps {
    className?: string;
    indicator?: ReactNode;
    isCenter?: boolean;
    size?: "lg" | "md" | "sm" | number;
    tone?: "current" | "muted" | "primary";
}

interface TableProps {
    columns: Column[];
    dataSource: any[];
    loading?: boolean;
    size?: "middle" | "small";
    bordered?: boolean;
    pagination?: PaginationProps | false;
    showHeader?: Responsive["value"][] | boolean;
    onRow?: (record: any, index: number) => {
        onClick: (() => Promise<boolean>) | (() => void);
    };
    rowClassName?: ((record: any, index: number) => string) | string | undefined;
    rowKey?: (model: any) => string;
    header?: ReactNode;
    footer?: ReactNode;
    empty?: ReactNode;
    loadingIndicator?: ReactNode;
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "onPressEnter" | "type" | "value"> & {
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

interface TimePickerProps {
    className?: string;
    value: Dayjs | null;
    onChange: (value: Dayjs) => void;
    disabled?: boolean;
    disabledDate?: (date: Dayjs) => boolean | null | undefined;
}

interface ToggleSelectProps<I extends boolean | null | number | string> {
    className?: string;
    btnClassName?: string;
    items: number[] | string[] | {
        label: string;
        value: I;
        disabled?: boolean;
    }[];
    value: I;
    nullable: boolean;
    validate: (value: I) => boolean | string;
    onChange: (value: I, idx: number) => void;
    onClear?: () => void;
    disabled?: boolean;
    renderItem?: (item: {
        label: string;
        value: I;
        disabled?: boolean;
    }, state: {
        selected: boolean;
        disabled: boolean;
        onToggle: () => void;
    }) => ReactNode;
}

interface UnauthorizedProps {
    className?: string;
    icon?: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    minHeight?: number;
}
```
