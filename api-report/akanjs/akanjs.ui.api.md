# `akanjs/ui`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const Agent: {
    Chat: import("react").ComponentType<import("./Chat").ChatProps>;
    Context: typeof Context;
    Dock: ({ className, bridge, surface, open }: import("./Dock").DockProps) => import("react").JSX.Element | null;
    Guide: ({ instructions }: import("./Guide").GuideProps) => null;
    History: ({ load, save, clear, onCompact }: import("./History").HistoryProps) => null;
    Scope: ({ id, label, kind, children }: import("use-agentic").AgentScopeProps) => import("react").JSX.Element;
    Section: typeof Section;
    Skip: ({ className, label, children }: import("./Skip").SkipProps) => import("react").JSX.Element;
    StateKey: typeof StateKey;
    Tool: typeof Tool;
    Transcript: typeof Transcript;
    Zone: ({ className, id, label, instructions, runner, maxTurns, compact, builtins, persist, onCompact, visual, session: provided, onSession, children, }: import("./Zone").ZoneProps) => import("react").JSX.Element;
    useScreenActions: ({ surface }?: {
        surface?: import("use-agentic").AgenticSurface;
    }) => import("./useScreenActions").ScreenAction[];
};

export declare const AgentAttachments: ({ className, attachments, onRemove, removeLabel, pending, pendingLabel }: ChipsProps) => import("react").JSX.Element;

export interface AgentAttachmentsProps {
    className?: string;
    attachments: readonly MessageAttachment[];
    onRemove?: (index: number) => void;
    removeLabel?: string;
    pending?: number;
    pendingLabel?: string;
}

export type AgentBuiltin = (typeof StoreSurfaceSource.builtins)[number];

export interface AgentClientToolDefinition extends PublishedTool {
    readOnly: false;
}

export declare class AgentClientTools {
    constructor(surface?: SurfaceView, host?: ToolRunnerHost);
    list(): AgentClientToolDefinition[];
    run(call: ToolCallRequest, signal?: AbortSignal): Promise<ToolCallResult>;
}

export interface AgentHistoryProps {
    load: SessionHistory["load"];
    save: SessionHistory["save"];
    clear: SessionHistory["clear"];
    onCompact?: AgentSessionOptions["onCompact"];
}

export interface AgentMenuProps {
    className?: string;
    rows: MenuRow[];
    selected: number;
    prefix?: string;
    onPick: (row: MenuRow) => void;
}

export declare const AgentProvider: ({ surface, session, runner, children, ...options }: AgentProviderProps) => import("react").JSX.Element;

export interface AgentProviderProps extends AgentSessionOptions {
    surface?: AgenticSurface;
    session?: AgentSession;
    runner?: AgentRunner;
    children: ReactNode;
}

export interface AgentReferenceInput<T extends AgentFieldType> {
    refName: string;
    refId: string;
    label: string;
    path?: string;
    type: T;
    value: AgentValueOf<T>;
}

export declare const AgentReferences: ({ className, references, onRemove, removeLabel }: ReferenceChipsProps) => import("react").JSX.Element;

export interface AgentReferencesProps {
    className?: string;
    references: readonly MessageReference[];
    onRemove?: (key: string) => void;
    removeLabel?: string;
}

export interface AgentRunner {
    run: (request: RunnerRequest) => AsyncIterable<RunnerEvent>;
}

export declare class AgentSession {
    static readonly askUserTool: PublishedTool;
    constructor(surface: SurfaceView, runner: AgentRunner, options?: AgentSessionOptions);
    get isRestoring(): boolean;
    get surface(): SurfaceView;
    get messages(): readonly ChatMessage[];
    get isRunning(): boolean;
    get isCompacting(): boolean;
    get pendingApproval(): PendingApproval | null;
    get pendingQuestion(): PendingQuestion | null;
    get pendingCard(): PendingCard | null;
    get staged(): readonly MessageReference[];
    stage: (reference: MessageReference) => void;
    refer: (reference: MessageReference) => void;
    get pendingInserts(): readonly MessageReference[];
    insertApplied: (key: string) => void;
    restoreStaged: (references: readonly MessageReference[]) => void;
    attachChat: () => () => void;
    unstage: (key: string) => void;
    clearStaged: () => void;
    get progress(): (AgentProgressReport & {
        callId: string;
    }) | null;
    get version(): number;
    subscribe: (listener: () => void) => () => void;
    send: (input: ChatMessage[] | string) => Promise<void>;
    abort: () => void;
    reset: ({ keepHistory }?: {
        keepHistory?: boolean;
    }) => Promise<void>;
    setHistory: (history: SessionHistory | null) => () => void;
    setOnCompact: (onCompact: AgentSessionOptions["onCompact"] | null) => () => void;
    retry: () => Promise<boolean>;
    compact: ({ keep }?: {
        keep?: number;
    }) => Promise<boolean>;
    get tokens(): number;
    get context(): {
        used: number;
        compactAt?: number;
    };
    report: (error: string) => void;
    note: (text: string) => void;
}

export interface AgentSessionOptions {
    instructions?: string;
    buildContext?: (surface: SurfaceView) => ContextBlock[];
    maxTurns?: number;
    history?: SessionHistory;
    settle?: () => Promise<void> | void;
    continueAsk?: () => {
        question: string;
        keep: string;
    };
    compact?: CompactOptions;
    onCompact?: (replaced: readonly ChatMessage[], summary: ChatMessage) => void;
    onActivity?: (event: ToolActivity) => Promise<void> | void;
    askAfterUntrusted?: boolean;
    onTurn?: (running: boolean) => void;
}

export interface AgentSessionSetup {
    l: (key: string) => string;
    view?: string[];
    runner?: AgentRunner;
    instructions?: string;
    maxTurns?: number;
    compact?: CompactOptions;
    builtins?: BuiltinOption;
    persist?: PersistOption | SessionHistory;
    onCompact?: AgentSessionOptions["onCompact"];
    visual?: AgentVisualOption | boolean;
}

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
    AgentToolRow: ComponentType<AgentToolRowProps>;
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

export interface ApprovalProps {
    className?: string;
    approval: PendingApproval;
}

export interface AttachLimits {
    perFileBytes?: number;
    perMessageBytes?: number;
    perMessageCount?: number;
}

export type AttachReader = (file: File) => Promise<MessageAttachment | null>;

export declare const Badge: import("react").ComponentType<BadgeProps>;

export type BadgeVariants = NonNullable<Parameters<typeof badgeRecipe>[0]>;

export declare const BottomSheet: import("react").ForwardRefExoticComponent<BottomSheetProps & import("react").RefAttributes<BottomSheetRef>>;

export interface BottomSheetRef {
    open: () => void;
    close: () => void;
}

export interface BubbleProps {
    className?: string;
    message: ChatMessage;
    progress?: (AgentProgressReport & {
        callId: string;
    }) | null;
    results?: ReadonlyMap<string, ToolCallResult>;
}

export type BuiltinOption = AgentBuiltin[] | boolean;

export declare const Button: <Result = unknown>(props: ButtonProps<Result>) => React.ReactElement<ButtonProps<Result>, React.JSXElementConstructor<any> | string>;

export type ButtonVariants = NonNullable<Parameters<typeof buttonRecipe>[0]>;

export interface ChatCommand {
    name: string;
    aliases?: string[];
    description: string;
    run: (context: ChatCommandContext) => Promise<void> | void;
}

export declare class ChatCommands {
    static list(l: (key: string) => string): ChatCommand[];
    static find(name: string, l: (key: string) => string): ChatCommand | null;
    static run(command: ChatCommand, context: ChatCommandContext): Promise<void>;
    static transcriptOf(messages: readonly ChatMessage[], where?: string): string;
}

export interface ChatMessage {
    role: ChatRole;
    text?: string;
    attachments?: MessageAttachment[];
    references?: MessageReference[];
    toolCalls?: ToolCallRequest[];
    toolResults?: ToolCallResult[];
    error?: string;
    errorCode?: string;
    local?: boolean;
    summary?: boolean;
    usage?: TurnUsage;
}

export interface ChatProps {
    className?: string;
    title?: ReactNode;
    label?: string;
    instructions?: string;
    runner?: AgentRunner;
    maxTurns?: number;
    compact?: CompactOptions;
    builtins?: BuiltinOption;
    onCompact?: AgentSessionOptions["onCompact"];
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    visual?: AgentVisualOption | boolean;
    launcher?: boolean;
    persist?: PersistOption | SessionHistory;
    inline?: boolean;
    shortcut?: boolean;
    launcherClassName?: string;
    launcherPlacement?: "left" | "right";
    hideLauncherBelow?: "lg" | "md" | "sm";
    panelClassName?: string;
    intro?: ReactNode;
    header?: ReactNode;
    chrome?: boolean;
    defaultDraft?: string;
    attach?: AttachReader;
    reference?: readonly ReferenceSource[];
    mentions?: boolean;
    attachLimits?: AttachLimits;
    voice?: VoiceEngine;
}

export declare const ClientSide: ({ children, loading }: ClientSideProps) => import("react").JSX.Element;

export declare const Clipboard: ({ text, className }: ClipboardProps) => ReactElement;

export interface CodeProps {
    className?: string;
    lang?: string;
    text: string;
}

export interface CompactOptions {
    at?: number;
    keep?: number;
    buffer?: number;
    summarize?: (digest: string, signal: AbortSignal) => Promise<string>;
}

export interface ComposerHandle {
    focus: () => void;
    caret: () => null | number;
    setCaret: (at: number) => void;
}

export interface ComposerProps {
    className?: string;
    session: AgentSession;
    draft: string;
    attached: readonly MessageAttachment[];
    references?: readonly MessageReference[];
    pending?: number;
    mic?: {
        listening: boolean;
        onToggle: () => void;
    };
    onDraft: (text: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onFiles: (files: File[]) => void;
    onRemoveFile: (idx: number) => void;
    onRemoveReference?: (key: string) => void;
    onSend: () => void;
    onStop: () => void;
    inputRef?: RefObject<HTMLTextAreaElement | null>;
    mentions?: boolean;
    isMenuOpen?: boolean;
    handleRef?: RefObject<ComposerHandle | null>;
}

export declare const Constant: {
    Doc: {
        Zone: ({ models, scalars, enums, include, exclude, libs, openAll, groupBy }: import("./Doc").ZoneProps) => import("react").JSX.Element;
        Print: ({ models, scalars, enums, include, exclude, libs }: import("./Doc").ZoneProps) => import("react").JSX.Element;
        Model: ({ refName, database: databaseProp, openAll }: import("./Doc").ModelProps) => import("react").JSX.Element | null;
        Scalar: ({ refName, scalar: scalarProp, openAll }: import("./Doc").ScalarProps) => import("react").JSX.Element | null;
        Enum: ({ enums }: import("./Doc").EnumProps) => import("react").JSX.Element;
    };
    Graph: ({ className, title, nodes, edges, selectedId, onSelect }: import("./Graph").GraphProps) => import("react").JSX.Element;
};

export interface ConstantSchemaDoc {
    databases: DatabaseSchema[];
    scalars: ScalarSchema[];
    enums: EnumSchema[];
    relations: RelationSchema[];
}

export interface ConstantSchemaOptions {
    models?: string[];
    scalars?: string[];
    enums?: string[];
    include?: string[];
    exclude?: string[];
    libs?: string[];
}

export interface ContextBlock {
    kind: string;
    [key: string]: unknown;
}

export declare const Copy: ({ text, copyMessage, children }: CopyProps) => import("react").JSX.Element;

export declare const CsrImage: ({ src, alt, file, className, abstractData, ...props }: CsrImageProps) => import("react").JSX.Element;

export declare const DROPDOWN_KEEP_OPEN_ATTR = "data-dropdown-keep-open";

export declare const Data: {
    CardList: typeof import("./CardList").default;
    Dashboard: typeof import("./Dashboard").default;
    Insight: typeof import("./Insight").default;
    Item: typeof import("./Item").default;
    ListContainer: typeof import("./ListContainer").default;
    Pagination: typeof import("./Pagination").default;
    QueryMaker: typeof import("./QueryMaker").default;
    RefPicker: typeof import("./RefPicker").default;
    TableList: typeof import("./TableList").default;
};

export interface DatabaseSchema {
    kind: "database";
    refName: string;
    origin: string[];
    modelName: string;
    variants: Record<DatabaseModelVariant, ModelVariantSchema>;
}

export declare const DatePicker: import("react").ComponentType<DatePickerProps> & {
    RangePicker: import("react").ComponentType<RangePickerProps>;
    TimePicker: import("react").ComponentType<TimePickerProps>;
};

export declare const DefaultAgentMenu: ({ className, rows, selected, prefix, onPick }: MenuProps) => import("react").JSX.Element | null;

export declare const DefaultApproval: ({ className, approval }: ApprovalProps) => import("react").JSX.Element;

export declare const DefaultBubble: import("react").MemoExoticComponent<({ className, message, progress, results }: BubbleProps) => import("react").JSX.Element>;

export declare const DefaultCode: ({ className, lang, text }: CodeProps) => import("react").JSX.Element;

export declare const DefaultComposer: ({ className, session, draft, attached, references, pending, mic, onDraft, onKeyDown, onFiles, onRemoveFile, onRemoveReference, onSend, onStop, inputRef, mentions, handleRef, }: ComposerProps) => import("react").JSX.Element;

export declare const DefaultLauncher: ({ className, style, label, hotkey, unread, onOpen, buttonRef }: LauncherProps) => import("react").JSX.Element;

export declare const DefaultMarkdown: ({ className, children }: MarkdownProps) => import("react").JSX.Element;

export declare const DefaultQuestion: ({ className, question }: QuestionProps) => import("react").JSX.Element;

export declare const DefaultQueued: ({ className, message, onEdit, onCancel }: QueuedProps) => import("react").JSX.Element;

export declare const DefaultSteps: ({ messages, progress, results }: StepsProps) => import("react").JSX.Element;

export declare const DefaultToast: ({ className, messages, topSafeArea, onClose, onClosed }: ToastProps) => import("react").JSX.Element;

export declare const DefaultToastItem: ({ className, message, onClose, onClosed }: ToastItemProps) => import("react").JSX.Element;

export declare const DefaultToolCard: ({ className, card }: ToolCardProps) => import("react").JSX.Element;

export declare const DefaultToolRow: ({ className, name, args, result, progress }: ToolRowProps) => import("react").JSX.Element;

export declare const DevModeToggle: () => import("react").JSX.Element;

export declare const Dialog: {
    ({ children, ...props }: ProviderProps): import("react").JSX.Element;
    Modal: ({ className, bodyClassName, confirmClose, closeButton, children, onCancel, presentation, placement, }: import("./Modal").ModalProps) => import("react").ReactPortal | null;
    LegacyModal: ({ className, bodyClassName, confirmClose, children, onCancel }: import("./LegacyModal").LegacyModalProps) => import("react").ReactPortal | null;
    Title: ({ children }: import("./Provider").TitleProps) => null;
    Action: ({ children }: import("./Provider").ActionProps) => null;
    Trigger: ({ className, children }: import("./Provider").TriggerProps) => import("react").JSX.Element;
    Content: ({ className, children }: import("./Provider").ContentProps) => import("react").JSX.Element;
};

export declare const DragAction: {
    ({ className, children, onClick, onLeft, onRight }: DragActionProps): import("react").JSX.Element;
    Body: ({ children }: BodyProps) => import("react").JSX.Element;
    Left: ({ children }: LeftProps) => import("react").JSX.Element;
    Right: ({ children }: RightProps) => import("react").JSX.Element;
};

export declare const DraggableList: {
    <V>({ className, mode, children, onChange, onRemove }: DragListProps<V>): import("react").JSX.Element;
    Cursor({ className, children }: Cursor): import("react").JSX.Element;
    Item: ({ value, children, className, cursorClassName, cursor, removable, removeClassName, }: ItemProps) => import("react").JSX.Element;
};

export declare const Dropdown: import("react").ComponentType<DropdownProps>;

export declare const Empty: import("react").ComponentType<EmptyProps>;

export interface EnumSchema {
    key: string;
    refName: string;
    origin: string[];
    typeName: string;
    values: (number | string)[];
    enumRef: EnumInstance;
    usedBy: EnumUsage[];
}

export declare const Field: (({ className, containerClassName, labelClassName, label, desc, nullable, children, }: FieldProps) => import("react").JSX.Element) & {
    Label: ({ className, label, desc, unit, nullable, mode }: import("./Label").LabelProps) => import("react").JSX.Element;
    List: <Item>({ className, labelClassName, label, desc, value, onChange, onAdd, nullable, renderItem, }: import("./Collection").ListProps<Item>) => import("react").JSX.Element;
    Text: import("react").MemoExoticComponent<({ label, desc, labelClassName, className, value, onChange, placeholder, nullable, disabled, minlength, maxlength, transform, validate, onPressEnter, inputClassName, inputStyleType, }: import("./Text").TextProps) => import("react").JSX.Element>;
    TextArea: import("react").MemoExoticComponent<({ label, desc, labelClassName, className, value, onChange, placeholder, nullable, disabled, rows, minlength, maxlength, transform, validate, onPressEnter, inputClassName, }: import("./Text").TextAreaProps) => import("react").JSX.Element>;
    Switch: ({ label, desc, labelClassName, className, value, onChange, disabled, inputClassName, onDesc, offDesc, variant, }: import("./Choice").SwitchProps) => import("react").JSX.Element;
    ToggleSelect: <I extends boolean | null | number | string, Nullable extends boolean = false>({ className, labelClassName, label, desc, items, value, validate, onChange, nullable, disabled, btnClassName, }: import("./Choice").ToggleSelectProps<I, Nullable>) => import("react").JSX.Element;
    MultiToggleSelect: <I extends boolean | number | string>({ className, labelClassName, label, desc, items, value, minlength, maxlength, validate, onChange, disabled, }: import("./Choice").MultiToggleSelectProps<I>) => import("react").JSX.Element;
    TextList: ({ label, desc, labelClassName, className, value, onChange, placeholder, disabled, transform, minlength, maxlength, minTextlength, maxTextlength, validate, inputClassName, }: import("./Collection").TextListProps) => import("react").JSX.Element;
    Tags: ({ label, desc, labelClassName, className, value, onChange, placeholder, disabled, transform, minlength, maxlength, minTextlength, maxTextlength, validate, inputClassName, }: import("./Collection").TagsProps) => import("react").JSX.Element;
    Date: <Nullable extends boolean>({ className, labelClassName, nullable, label, desc, value, min, max, onChange, showTime, dateClassName, }: import("./DateField").DateProps<Nullable>) => import("react").JSX.Element;
    DateRange: <Nullable extends boolean>({ className, labelClassName, nullable, label, desc, from, to, min, max, onChangeFrom, onChangeTo, onChange, showTime, }: import("./DateField").DateRangeProps<Nullable>) => import("react").JSX.Element;
    Number: ({ label, desc, labelClassName, className, value, onChange, placeholder, nullable, disabled, min, max, transform, validate, onPressEnter, inputClassName, unit, formatter, parser, }: import("./NumberField").NumberProps) => import("react").JSX.Element;
    DoubleNumber: ({ label, desc, labelClassName, className, value, placeholder, nullable, disabled, min, max, inputClassName, separator, onChange, transform, validate, onPressEnter, }: import("./NumberField").DoubleNumberProps) => import("react").JSX.Element;
    Email: ({ label, desc, labelClassName, className, value, onChange, placeholder, nullable, disabled, minlength, maxlength, transform, validate, onPressEnter, inputClassName, inputStyleType, }: import("./Text").EmailProps) => import("react").JSX.Element;
    Phone: ({ label, desc, labelClassName, className, value, onChange, placeholder, nullable, disabled, maxlength, transform, validate, onPressEnter, inputClassName, }: import("./Text").PhoneProps) => import("react").JSX.Element;
    Password: ({ label, desc, labelClassName, className, value, onChange, confirmValue, onChangeConfirm, placeholder, nullable, disabled, minlength, maxlength, transform, validate, onPressEnter, inputClassName, showConfirm, }: import("./Text").PasswordProps) => import("react").JSX.Element;
    Parent: <Light extends {
        id: string;
    }, Sort = unknown>({ label, desc, labelClassName, selectClassName, className, nullable, disabled, initArgs, limit, sort, slice, value, onChange, onSearch, sortOption, renderOption, renderSelected, }: import("./Relation").ParentProps<Light, Sort>) => import("react").JSX.Element;
    ParentId: <Light extends {
        id: string;
    }, Sort = unknown>({ label, desc, className, selectClassName, labelClassName, nullable, disabled, initArgs, limit, sort, slice, value, onChange, onSearch, sortOption, renderOption, renderSelected, }: import("./Relation").ParentIdProps<Light, Sort>) => import("react").JSX.Element;
    Children: <Light extends {
        id: string;
    }, Sort = unknown>({ label, desc, labelClassName, selectClassName, className, nullable, disabled, initArgs, limit, sort, slice, value, onChange, onSearch, sortOption, renderOption, renderSelected, }: import("./Relation").ChildrenProps<Light, Sort>) => import("react").JSX.Element;
    ChildrenId: <Light extends {
        id: string;
    }, Sort = unknown>({ label, desc, labelClassName, className, nullable, disabled, initArgs, limit, sort, slice, value, onChange, onSearch, sortOption, renderOption, }: import("./Relation").ChildrenIdProps<Light, Sort>) => import("react").JSX.Element;
};

export declare const FontFace: ({ font }: FontFaceProps) => null;

export declare const Image: (imageProps: AkanImageProps & ({
    src?: string;
    file?: ProtoLightFile;
    abstractData?: null | string;
    alt?: string;
} | {
    src?: undefined;
    abstractData?: null | string;
    file: null | {
        url: string;
        imageSize: [
            number,
            number
        ];
        abstractData?: null | string;
    };
    alt?: string;
})) => import("react").JSX.Element;

export declare const InfiniteScroll: ({ hasMore, onLoadMore, children, reverse, loading }: InfiniteScrollProps) => import("react").JSX.Element;

export declare const Input: React.ComponentType<InputProps> & {
    TextArea: React.ComponentType<TextAreaProps>;
    Password: React.ComponentType<PasswordProps>;
    Email: React.ComponentType<EmailProps>;
    Number: React.ComponentType<NumberProps>;
    Checkbox: React.ComponentType<CheckboxProps>;
};

export type InputSurfaceVariants = NonNullable<Parameters<typeof inputRecipe>[0]>;

export declare const KeyboardAvoiding: ({ children, className }: KeyboardAvoidingProps) => import("react").JSX.Element;

export interface LauncherProps {
    className?: string;
    style?: CSSProperties;
    label: string;
    hotkey?: null | {
        label: string;
        keys: string;
    };
    unread: number;
    onOpen: () => void;
    buttonRef?: Ref<HTMLButtonElement>;
}

export declare const Layout: {
    Header: ({ className, type, children, height }: import("./Header").HeaderProps) => import("react").JSX.Element;
    Sider: ({ className, bgClassName, trigger, header, close, children }: import("./Sider").SiderProps) => import("react").JSX.Element;
    Navbar: ({ back, backFallback, className, height, children, title, left, right, }: import("./Navbar").NavbarProps) => import("react").JSX.Element;
    TopInset: ({ className, children, estimatedHeight }: import("./TopInset").TopInsetProps) => import("react").JSX.Element;
    BottomTab: ({ className, tabs, height, label, renderTab }: import("./BottomTab").BottomTabProps) => import("react").JSX.Element;
    BottomInset: ({ className, children, keyboardSticky, contentAnchor, role, estimatedHeight, frameScope, frameSource, frameCache, }: import("./BottomInset").BottomInsetProps) => import("react").JSX.Element;
    Template: ({ className, children }: import("./Role").TemplateProps) => import("react").JSX.Element;
    Unit: ({ className, children, href }: import("./Role").UnitProps) => import("react").JSX.Element;
    View: ({ className, children }: import("./Role").ViewProps) => import("react").JSX.Element;
    Zone: ({ className, children }: import("./Role").ZoneProps) => import("react").JSX.Element;
    TopLeftAction: ({ className, children }: import("./TopInset").TopLeftActionProps) => import("react").JSX.Element;
    LeftSider: ({ className, children, open, width, close, onCancel }: import("./Sider").LeftSiderProps) => import("react").JSX.Element;
    RightSider: ({ className, children, open, title, width, close, onCancel }: import("./Sider").RightSiderProps) => import("react").JSX.Element;
};

export declare const LegacyModal: ({ className, title, action, open, onCancel, bodyClassName, children, confirmClose, }: LegacyModalProps) => import("react").JSX.Element;

export declare const Link: {
    ({ className, href, disabled, children, ...props }: CommonLinkProps): import("react").JSX.Element;
    Back: ({ className, children, fallback }: import("./Action").BackProps) => import("react").JSX.Element;
    Close: ({ className, children }: import("./Action").ActionProps) => import("react").JSX.Element;
    Lang: ({ className, lang, children }: import("./Action").LangProps) => import("react").JSX.Element;
};

export declare const Load: {
    Edit: typeof Edit;
    Pagination: typeof import("./Pagination").default;
    Units: typeof import("./Units").default;
    View: typeof import("./View").default;
    Page: <Return>(props: import("./Page").PageProps<Return>) => import("react").ReactNode;
    Stream: typeof Stream;
};

export declare const Loading: {
    Area: import("react").ComponentType<import("./Spin").AreaProps>;
    Button: import("react").ComponentType<import("./Skeleton").SkeletonProps>;
    Input: import("react").ComponentType<import("./Skeleton").SkeletonProps>;
    ProgressBar: import("react").ComponentType<import("./ProgressBar").ProgressBarProps>;
    Skeleton: import("react").ComponentType<import("./Skeleton").SkeletonProps>;
    Spin: import("react").ComponentType<import("./Spin").SpinProps>;
};

export interface MarkdownProps {
    className?: string;
    children: string;
}

export declare const Menu: import("react").ComponentType<MenuProps>;

export interface MenuRow {
    id: string;
    name: string;
    description?: string;
    hint?: string;
    pick: () => void;
}

export interface MessageAttachment {
    name: string;
    mimeType: string;
    data?: string;
    url?: string;
    text?: string;
    ref?: string;
}

export interface MessageReference {
    refName: string;
    refId: string;
    label: string;
    path?: string;
    value?: unknown;
    note?: string;
}

export declare const Modal: import("react").ComponentType<ModalProps>;

export type ModalPlacement = "center" | "right";

export type ModalPresentation = "auto" | "dialog" | "sheet";

export interface ModalSurfaceProps {
    presentation?: ModalPresentation;
    placement?: ModalPlacement;
}

export declare const Model: {
    ViewModal: typeof import("./ViewModal").default;
    View: typeof import("./View").default;
    EditModal: typeof import("./EditModal").default;
    EditWrapper: typeof import("./EditWrapper").default;
    NewWrapper: typeof import("./NewWrapper").default;
    SureToRemove: typeof import("./SureToRemove").default;
    Remove: typeof import("./Remove").default;
    RemoveWrapper: typeof import("./RemoveWrapper").default;
    LoadInit: typeof import("./LoadStore").LoadInit;
    LoadView: typeof import("./LoadStore").LoadView;
    ViewWrapper: typeof import("./ViewWrapper").default;
    ViewEditModal: typeof import("./ViewEditModal").default;
    Edit: typeof import("./Edit").default;
    New: typeof import("./New").default;
    AdminPanel: typeof import("./AdminPanel").default;
};

export declare const More: ({ total, itemsPerPage, currentPage, hasMore, onLoadMore, onPageSelect, children, className, reverse, }: MoreProps) => import("react").JSX.Element;

export declare const OVERLAY_LAYER_ATTR = "data-akan-overlay";

export declare const ObjectId: ({ id }: ObjectIdProps) => import("react").JSX.Element;

export declare const OverlayOwnerProvider: import("react").Provider<string>;

export declare const Pagination: import("react").ComponentType<PaginationProps>;

export type PersistOption = boolean | {
    storage?: "local" | "session";
    key?: string;
};

export declare const Popconfirm: import("react").ComponentType<PopconfirmProps>;

export declare const Portal: ({ children, id }: PortalProps) => import("react").ReactPortal | null;

export interface PublishedTool {
    name: string;
    description?: string;
    parameters?: JsonSchema;
    needsConfirm: boolean;
}

export interface QuestionProps {
    className?: string;
    question: PendingQuestion;
}

export interface QueuedMessage {
    text: string;
    attachments: MessageAttachment[];
    references: MessageReference[];
    byVoice: boolean;
}

export interface QueuedProps {
    className?: string;
    message: QueuedMessage;
    onEdit: () => void;
    onCancel: () => void;
}

export declare const Radio: import("react").ComponentType<RadioProps> & {
    Item: import("react").ComponentType<ItemProps>;
};

export declare const RecentTime: ({ date, breakUnit, format, relative, className }: RecentTimeProps) => import("react").JSX.Element | null;

export interface RecentTimeProps {
    date: Date | Dayjs | null;
    breakUnit?: Intl.RelativeTimeFormatUnit;
    format?: "auto" | "full";
    relative?: RecentTimeRelativeFormat;
    className?: string;
}

export interface RecentTimeRelative {
    unit: RecentTimeRelativeUnit;
    count: number;
    date: Dayjs;
    now: Dayjs;
    defaultLabel: string;
}

export type RecentTimeRelativeFormat = ((relative: RecentTimeRelative) => string) | RecentTimeRelativeStyle;

export type RecentTimeRelativeStyle = "always" | "auto" | "fromNow";

export type RecentTimeRelativeUnit = "day" | "hour" | "minute" | "month" | "second" | "week" | "year";

export declare class Reference {
    static readonly limit = 20000;
    static keyOf({ refName, refId, path }: MessageReference): string;
    static same(one: MessageReference, other: MessageReference): boolean;
    static token(reference: MessageReference): string;
    static readonly pattern: RegExp;
    static pointerOf([, label, refName, refId, path]: RegExpMatchArray): MessageReference;
    static parse(text: string): MessageReference[];
    static clipped(reference: MessageReference): MessageReference;
    static without(text: string, key: string): string;
    static readonly unstagedNote = "the value was not captured with this reference, so read it again with a tool before answering about it";
}

export interface ReferenceCandidate {
    refId: string;
    label: string;
    description?: string;
}

export interface ReferenceSource<T extends AgentFieldType = AgentFieldType> {
    refName: string;
    label: string;
    type: T;
    search: (query: string, signal: AbortSignal) => Promise<ReferenceCandidate[]>;
    resolve: (refId: string) => Promise<unknown>;
}

export declare const Refresh: ({ children, onRefresh }: RefreshProps) => import("react").JSX.Element;

export interface RelationSchema {
    sourceRefName: string;
    sourceVariant: "scalar" | DatabaseModelVariant;
    targetRefName: string;
    targetKind: "database" | "scalar";
    fieldKey: string;
    relationType: string;
    external: boolean;
}

export type RunnerEvent = {
    type: "done";
    stop: TurnStop;
    usage?: TurnUsage;
    limits?: TurnLimits;
} | {
    type: "error";
    message: string;
    code?: string;
    data?: Record<string, number | string>;
    overflow?: TurnOverflow;
} | {
    type: "text";
    delta: string;
} | {
    type: "toolCall";
    id: string;
    name: string;
    args: Record<string, unknown>;
};

export interface RunnerRequest {
    messages: ChatMessage[];
    tools: PublishedTool[];
    context: ContextBlock[];
    instructions?: string;
    signal: AbortSignal;
}

export interface ScalarSchema {
    kind: "scalar";
    refName: string;
    origin: string[];
    modelName: string;
    modelRef: ConstantCls;
    fields: FieldSchema[];
}

export declare const ScreenNavigator: {
    ({ children, setMenu, menus, namespace }: ScreenNavigatorProps): import("react").JSX.Element;
    NavbarItem: ({ menu, children, className }: {
        menu: string;
        children: ReactNode;
        className?: string;
    }) => import("react").JSX.Element;
    Screen: ({ children }: {
        children: React.ReactNode;
    }) => import("react").JSX.Element;
};

export declare const Select: <T extends boolean | null | number | string | undefined, Multiple extends boolean = false, Searchable extends boolean = false, Option extends Options<T> = Options<T>>(props: SelectProps<T, Multiple, Searchable, Option>) => import("react").ReactElement<SelectProps<T, Multiple, Searchable, Option>, import("react").JSXElementConstructor<any> | string>;

export declare const SelectLanguage: ({ className, languages }: SelectLanguageProps) => import("react").JSX.Element;

export declare const SessionContext: import("react").Context<AgentSession | null>;

export interface SessionHistory {
    load(): ChatMessage[] | Promise<ChatMessage[] | null> | null;
    save(messages: readonly ChatMessage[]): Promise<void> | void;
    clear(): Promise<void> | void;
}

export declare const Signal: {
    Doc: {
        Zone: ({ refName, fetch, openAll }: import("./Doc").ZoneProps) => import("react").JSX.Element;
        Explorer: ({ className, fetch, include, exclude, libs, defaultRefName, openAll, groupBy, }: import("./Doc").ExplorerProps) => import("react").JSX.Element;
        Setting: ({ fetch, search, onSearch }: import("./Doc").DocSettingProps) => import("react").JSX.Element;
        AuthModal: ({ children }: import("./Doc").DocAuthModalProps) => import("react").JSX.Element;
        DocSignals: ({ fetch, include, exclude, libs }: import("./Doc").DocSignalsProps) => import("react").JSX.Element;
        DocSignal: ({ refName, fetch }: import("./Doc").DocSignalProps) => import("react").JSX.Element;
    };
    Object: {
        Type: ({ objRef, arrDepth, nullable }: import("./Object").ObjectTypeProps) => import("react").JSX.Element;
        Detail: ({ className, objRef }: import("./Object").ObjectDetailProps) => import("react").JSX.Element;
        Schema: ({ objRef }: import("./Object").ObjectSchemaProps) => import("react").JSX.Element;
    };
    RestApi: {
        Endpoints: ({ refName, fetch, prefix, endpoints, openAll, httpUri, search, }: import("./RestApi").RestApiEndpointsProps) => import("react").JSX.Element;
        Endpoint: ({ refName, fetch, signalPrefix, endpointKey, endpoint, open, httpUri, }: import("./RestApi").RestApiEndpointProps) => import("react").JSX.Element;
        Interface: ({ refName, endpointKey, endpoint }: import("./RestApi").RestApiInterfaceProps) => import("react").JSX.Element;
        Try: ({ signalPrefix, refName, endpointKey, endpoint, fetch, httpUri, }: import("./RestApi").RestApiTryProps) => import("react").JSX.Element;
    };
    Arg: typeof Arg;
    Listener: {
        Result: ({ status, data }: import("./Listener").ListenerResultProps) => import("react").JSX.Element;
    };
    WebSocket: {
        Endpoints: ({ refName, fetch: docFetch, openAll, search, }: import("./WebSocket").WebSocketEndpointsProps) => import("react").JSX.Element;
    };
    PubSub: {
        Endpoint: ({ refName, endpointKey, endpoint, open }: import("./Endpoint").WsEndpointProps) => import("react").JSX.Element;
        Interface: ({ refName, endpointKey, endpoint }: import("./WebSocket").WsInterfaceProps) => import("react").JSX.Element;
        Try: ({ endpointKey, endpoint }: import("./WebSocket").WsInterfaceProps) => import("react").JSX.Element;
    };
    Message: {
        Endpoint: ({ refName, endpointKey, endpoint, open }: import("./Endpoint").WsEndpointProps) => import("react").JSX.Element;
        Interface: ({ refName, endpointKey, endpoint }: import("./WebSocket").WsInterfaceProps) => import("react").JSX.Element;
        Try: ({ endpointKey, endpoint }: import("./WebSocket").MessageTryProps) => import("react").JSX.Element;
    };
};

export interface StepsProps {
    messages: readonly ChatMessage[];
    isRunning: boolean;
    progress?: (AgentProgressReport & {
        callId: string;
    }) | null;
    results?: ReadonlyMap<string, ToolCallResult>;
}

export interface SurfaceView {
    snapshot(): SurfaceSnapshot;
    tool(name: string): ToolEntry | null;
    call(name: string, args?: Record<string, unknown>): Promise<unknown>;
    read(name: string): unknown;
    diffSince(before: SurfaceSnapshot): ResourceDiff[];
    subscribe(listener: () => void): () => void;
}

export declare const Switch: ({ checked, defaultChecked, disabled, onChange, className, variant, }: SwitchProps) => import("react").JSX.Element;

export interface SwitchProps {
    checked?: boolean;
    defaultChecked?: boolean;
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
    className?: string;
    variant?: "accent" | "primary" | "success";
}

export declare const System: {
    Provider: (props: CSRProviderProps | SSRProviderProps) => import("react").JSX.Element;
    App: ({ className, params, path, env, theme, viewport, fonts, children, }: import("./App").AppProviderProps) => import("react").JSX.Element;
    ThemeToggle: ({ themes }: import("./ThemeToggle").ThemeToggleProps) => import("react").JSX.Element | null;
    Root: ({ children, st }: import("./Root").RootProps) => import("react").JSX.Element;
    SelectLanguage: ({ className, languages }: import("./SelectLanguage").SelectLanguageProps) => import("react").JSX.Element;
    Reconnect: () => import("react").JSX.Element | null;
    DevModeToggle: () => import("react").JSX.Element;
};

export declare const Tab: {
    (props: ProviderProps): import("react").JSX.Element;
    Menu: ({ className, activeClassName, disabledClassName, disabled, menu, children, scrollToTop, tooltip, }: import("./Provider").MenuProps) => import("react").JSX.Element;
    Menus: ({ className, children }: import("./Provider").MenusProps) => import("react").JSX.Element;
    Panel: ({ className, menu, children, loading }: import("./Provider").PanelProps) => import("react").JSX.Element | null;
};

export declare const Table: React.ComponentType<TableProps>;

export declare const ThemeToggle: ({ themes }: ThemeToggleProps) => import("react").JSX.Element | null;

export declare const Toast: import("react").ComponentType<ToastProps> & {
    Item: import("react").ComponentType<ToastItemProps>;
};

export interface ToastItemProps {
    className?: string;
    message: ToastMessage;
    onClose: () => void;
    onClosed: () => void;
}

export interface ToastMessage {
    key: string;
    type: ToastType;
    content: ReactNode;
    duration: number;
    leaving: boolean;
}

export interface ToastProps {
    className?: string;
    messages: ToastMessage[];
    topSafeArea: number;
    onClose: (key: string) => void;
    onClosed: (key: string) => void;
}

export type ToastType = "error" | "info" | "loading" | "success" | "warning";

export declare const ToggleSelect: (<I extends boolean | null | number | string>(props: ToggleSelectProps<I>) => import("react").ReactElement<ToggleSelectProps<I>, import("react").JSXElementConstructor<any> | string>) & {
    Multi: ComponentType<MultiProps>;
};

export interface ToolApprovalRequest {
    callId: string;
    name: string;
    args: Record<string, unknown>;
    message: string;
}

export interface ToolCardProps {
    className?: string;
    card: PendingCard;
}

export interface ToolRowProps {
    className?: string;
    name: string;
    args?: Record<string, unknown>;
    result?: ToolCallResult;
    progress?: AgentProgressReport | null;
}

export interface ToolRunnerHost {
    approve?: (request: ToolApprovalRequest, signal: AbortSignal) => Promise<string | true>;
    askAfterUntrusted?: boolean;
    card?: (request: ToolCardRequest, signal: AbortSignal) => Promise<ToolCardAnswer>;
    settle?: () => Promise<void> | void;
    progress?: (progress: ToolProgress) => void;
    activity?: (event: ToolActivity) => Promise<void> | void;
    fallback?: (call: ToolCallRequest, signal: AbortSignal) => Promise<ToolCallResult> | ToolCallResult;
}

export declare const Tooltip: import("react").ComponentType<TooltipProps>;

export interface TooltipProps {
    content?: ReactNode;
    children: ReactNode;
    side?: OverlaySide;
    className?: string;
    variant?: "default" | "info" | "primary";
}

export declare const UiOverrideProvider: ({ value, children }: UiOverrideProviderProps) => import("react").JSX.Element;

export interface UiOverrideProviderProps {
    value?: AkanUiOverrideManifest;
    children?: ReactNode;
}

export declare const Unauthorized: import("react").ComponentType<UnauthorizedProps>;

export interface VoiceEngine {
    listen: (handlers: VoiceHandlers) => VoiceListener;
    speak: (text: string) => VoiceSpeech;
    available?: () => boolean;
}

export interface VoiceHandlers {
    onInterim?: (text: string) => void;
    onFinal: (text: string) => void;
    onError: (message: string) => void;
}

export interface VoiceListener {
    stop: () => void;
}

export interface VoiceSpeech {
    cancel: () => void;
    done: Promise<void>;
}

export interface WebAppManifest {
    name?: string;
    shortName?: string;
    startUrl?: string;
    scope?: string;
    display?: "browser" | "fullscreen" | "minimal-ui" | "standalone" | (string & {});
    displayOverride?: string[];
    orientation?: string;
    themeColor?: string;
    backgroundColor?: string;
    description?: string;
    lang?: string;
    dir?: "auto" | "ltr" | "rtl";
    icons?: WebAppManifestIcon[];
    categories?: string[];
    screenshots?: WebAppManifestIcon[];
    [key: string]: unknown;
}

export declare const agentAttrs: (handler: unknown, key?: number | string) => Record<string, never> | {
    "data-akan-action"?: string;
    "data-akan-state"?: string;
    "data-akan-key"?: string;
};

export declare const agentSessionOf: ({ l, view, runner, instructions, maxTurns, compact, builtins, persist, onCompact, visual, }: AgentSessionSetup) => AgentSession;

export declare const animated: {
    div: import("@react-spring/web").AnimatedComponent<"div">;
    g: import("@react-spring/web").AnimatedComponent<"g">;
    progress: import("@react-spring/web").AnimatedComponent<"progress">;
};

export declare const badgeRecipe: (variants?: Omit<({
    size?: "lg" | "md" | "sm" | "xs" | undefined;
    outline?: boolean | undefined;
    variant?: "accent" | "default" | "error" | "info" | "neutral" | "outline" | "primary" | "secondary" | "success" | "warning" | undefined;
} & {
    class?: import("tailwind-variants/lite").ClassValue;
    className?: never;
}) | ({
    size?: "lg" | "md" | "sm" | "xs" | undefined;
    outline?: boolean | undefined;
    variant?: "accent" | "default" | "error" | "info" | "neutral" | "outline" | "primary" | "secondary" | "success" | "warning" | undefined;
} & {
    class?: never;
    className?: import("tailwind-variants/lite").ClassValue;
}), "class" | "className"> | undefined, className?: import("tailwind-merge").ClassNameValue) => string;

export declare const buttonRecipe: (variants?: Omit<({
    size?: "icon" | "lg" | "md" | "sm" | "xl" | "xs" | undefined;
    outline?: boolean | undefined;
    variant?: "accent" | "default" | "destructive" | "ghost" | "info" | "link" | "neutral" | "outline" | "primary" | "secondary" | "success" | "warning" | undefined;
    shape?: "circle" | "default" | "square" | undefined;
} & {
    class?: import("tailwind-variants/lite").ClassValue;
    className?: never;
}) | ({
    size?: "icon" | "lg" | "md" | "sm" | "xl" | "xs" | undefined;
    outline?: boolean | undefined;
    variant?: "accent" | "default" | "destructive" | "ghost" | "info" | "link" | "neutral" | "outline" | "primary" | "secondary" | "success" | "warning" | undefined;
    shape?: "circle" | "default" | "square" | undefined;
} & {
    class?: never;
    className?: import("tailwind-variants/lite").ClassValue;
}), "class" | "className"> | undefined, className?: import("tailwind-merge").ClassNameValue) => string;

export declare const createOverridable: <K extends keyof AkanUiOverrides>(name: K, Default: AkanUiOverrides[K]) => AkanUiOverrides[K];

export declare const fetchRunner: (options?: {
    fetcher?: typeof globalThis.fetch;
}) => AgentRunner;

export declare const getConstantSchemaDoc: (options?: ConstantSchemaOptions) => ConstantSchemaDoc;

export declare const httpRunner: ({ url, headers, fetcher }: HttpRunnerOptions) => AgentRunner;

export declare const inputRecipe: (variants?: Omit<({
    kind?: "area" | "field" | "select" | undefined;
    size?: "lg" | "md" | "sm" | "xl" | "xs" | undefined;
    tone?: "default" | "error" | "primary" | undefined;
} & {
    class?: import("tailwind-variants/lite").ClassValue;
    className?: never;
}) | ({
    kind?: "area" | "field" | "select" | undefined;
    size?: "lg" | "md" | "sm" | "xl" | "xs" | undefined;
    tone?: "default" | "error" | "primary" | undefined;
} & {
    class?: never;
    className?: import("tailwind-variants/lite").ClassValue;
}), "class" | "className"> | undefined, className?: import("tailwind-merge").ClassNameValue) => string;

export declare const isOwnOverlayClick: (target: EventTarget | null, scope: string) => boolean;

export declare const maxAttachmentBytes: number;

export declare const maxMessageAttachmentBytes: number;

export declare const maxMessageAttachments = 5;

export declare const override: (overrides: AkanUiOverrideManifest) => AkanUiOverrideManifest;

export declare const recipe: <P extends object>(styles: (props?: P) => string) => (variants?: Omit<P, "class" | "className">, className?: ClassValue) => string;

export declare const tokenCount: (count: number) => string;

export declare const triggerSlot: (trigger: ReactNode, { className, onClick, as: Host, ...attrs }: TriggerSlotOptions & {
    [key: string]: unknown;
}) => import("react").JSX.Element;

export declare const tv: typeof joinTv;

export declare const useAgent: () => AgentSession;

export declare const useAgentReference: () => <T extends AgentFieldType>({ type, value, ...pointer }: AgentReferenceInput<T>) => void;

export declare const useOverlayLayerProps: (scrim?: boolean) => {
    "data-akan-scrim"?: string | undefined;
    "data-akan-overlay": string;
};

export declare const useOverlayScope: (id: string) => string;

export declare const useUiOverride: <K extends keyof AkanUiOverrides>(name: K) => AkanUiOverrides[K] | undefined;

export declare const useUiRecipe: <K extends keyof AkanUiRecipes>(name: K) => AkanUiRecipes[K] | undefined;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
// ui/Dialog/Provider
interface ActionProps {
    children?: ReactNode;
}

// ui/Link/Action
interface ActionProps {
    className?: string;
    children?: ReactNode;
}

declare function AdminPanel<RefName extends string, State, Input, Full extends {
    id: string;
}, Light extends {
    id: string;
}>({ slice, components, queryMap, summaryRefName, template, unit, view, summaryColumns, insightColumns, renderInsight, renderDashboard, ...props }: AdminPanelProps<RefName, State, Input, Full, Light>): import("react").JSX.Element;

interface AdminPanelProps<T extends string, State, Input, Full extends {
    id: string;
}, Light extends {
    id: string;
}> extends ListContainerProps<T, State, Input, Full, Light> {
    slice: SliceMeta;
    components: {
        Template: {
            [key: string]: any;
        };
        Unit: {
            [key: string]: any;
        };
        View: {
            [key: string]: any;
        };
    };
    template?: any;
    unit?: any;
    view?: any;
    queryMap?: {
        [column: string]: QuerySetting;
    };
    summaryRefName?: string;
    summaryColumns?: string[];
    insightColumns?: string[];
}

interface AgentCall {
    name: string;
    args: Record<string, unknown>;
    at: Date;
    error?: string;
}

declare class AgentGate {
    constructor(active: boolean, onChange: () => void, parent?: AgentGate | null);
    get active(): boolean;
    set(active: boolean): void;
}

interface AgentProgressReport {
    message: string;
    done?: number;
    total?: number;
    steps?: AgentProgressStep[];
}

interface AgentScopeProps {
    id: string;
    label?: string;
    kind?: string;
    children: ReactNode;
}

declare class AgenticSurface {
    static get shared(): AgenticSurface;
    static sanitize(part: string): string;
    static childPath(parent: string[], id: string): string[];
    static fullName(scope: string[], name: string): string;
    get version(): number;
    subscribe(listener: () => void): () => void;
    registerTool(scope: string[], entry: ToolEntry, gate?: AgentGate | null): () => void;
    registerResource(scope: string[], entry: ResourceEntry, gate?: AgentGate | null): () => void;
    openScope(parent: string[], scope: ScopeEntry, gate?: AgentGate | null): () => void;
    registerGuide(scope: string[], text: string, gate?: AgentGate | null): () => void;
    addSource(source: SurfaceSource): () => void;
    gate(active: boolean, parent?: AgentGate | null): AgentGate;
    gated(gate: AgentGate, guideGate?: AgentGate | null): AgenticSurface;
    snapshot(view?: string[]): SurfaceSnapshot;
    view(path: string[]): SurfaceView;
    tool(name: string, view?: string[]): ToolEntry | null;
    declares(name: string, view?: string[]): boolean;
    get transcript(): readonly AgentCall[];
    call(name: string, args?: Record<string, unknown>, view?: string[]): Promise<unknown>;
    read(name: string, view?: string[]): unknown;
    diffSince(before: SurfaceSnapshot, view?: string[]): ResourceDiff[];
}

type AkanImageProps = NativeImageProps & {
    src?: string;
    file?: ImageLikeFile;
    abstractData?: null | string;
    alt?: string;
    quality?: number;
    priority?: boolean;
    preload?: boolean;
    unoptimized?: boolean;
};

interface AppProviderProps {
    className?: string;
    params: {
        lang: string;
    };
    path?: string;
    env?: object;
    theme?: AkanTheme;
    viewport?: RouteViewport;
    fonts?: ReactFont[];
    children: ReactNode;
}

interface AreaProps {
    className?: string;
    indicator?: ReactNode;
    children?: ReactNode;
}

declare function Arg({ argType, value, onChange }: ArgProps): import("react").JSX.Element | null;
declare namespace Arg {
    var Table: ({ refName, endpointKey, args }: ArgTableProps) => import("react").JSX.Element;
    var Param: ({ endpointKey, arg, value, onChange }: ArgParamProps) => import("react").JSX.Element;
    var Query: ({ endpointKey, arg, label, value, onChange, renderScalar }: ArgQueryProps) => import("react").JSX.Element;
    var FormData: ({ endpointKey, arg, value, onChange }: ArgFormDataProps) => import("react").JSX.Element;
    var ID: ({ value, onChange }: ArgIDProps) => import("react").JSX.Element;
    var Int: ({ value, onChange }: ArgIntProps) => import("react").JSX.Element;
    var Float: ({ value, onChange }: ArgFloatProps) => import("react").JSX.Element;
    var String: ({ value, onChange }: ArgStringProps) => import("react").JSX.Element;
    var Boolean: ({ value, onChange }: ArgBooleanProps) => import("react").JSX.Element;
    var Date: ({ value, onChange }: ArgDateProps) => import("react").JSX.Element;
    var Json: ({ value, onChange }: ArgJsonProps) => import("react").JSX.Element;
    var Upload: ({ value, onChange }: ArgUploadProps) => import("react").JSX.Element;
}

interface ArgBooleanProps {
    value: boolean;
    onChange: (value: boolean) => void;
}

interface ArgDateProps {
    value: Dayjs;
    onChange: (value: Dayjs | null) => void;
}

interface ArgFloatProps {
    value: number;
    onChange: (value: number) => void;
}

interface ArgFormDataProps {
    endpointKey: string;
    arg: SerializedArg;
    value: any;
    onChange: (value: any) => void;
}

interface ArgIDProps {
    value: null | string;
    onChange: (value: string) => void;
}

interface ArgIntProps {
    value: number;
    onChange: (value: number) => void;
}

interface ArgJsonProps {
    value: string;
    onChange: (value: string) => void;
}

interface ArgParamProps {
    endpointKey: string;
    arg: SerializedArg;
    value: any;
    onChange: (value: any) => void;
}

interface ArgProps {
    argType: DefaultPrimitiveName;
    value: any;
    onChange: (value: any) => void;
}

interface ArgQueryProps {
    endpointKey: string;
    arg: SerializedArg;
    label?: string;
    value: any;
    onChange: (value: any) => void;
    renderScalar?: (value: any, onChange: (value: any) => void) => ReactNode;
}

interface ArgStringProps {
    value: null | string;
    onChange: (value: string) => void;
}

interface ArgTableProps {
    refName: string;
    endpointKey: string;
    args: SerializedArg[];
}

interface ArgUploadProps {
    value: FileList | null;
    onChange: (value: FileList | null) => void;
}

interface BackProps extends ActionProps {
    fallback?: string;
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & BadgeVariants;

interface BodyProps {
    children: ReactNode;
}

interface BottomInsetProps {
    className?: string;
    children: ReactNode;
    keyboardSticky?: boolean;
    contentAnchor?: "bottom";
    role?: "bottomChrome" | "keyboardAccessory";
    estimatedHeight?: number;
    frameScope?: FrameSlotRegistration["scope"];
    frameSource?: FrameSlotRegistration["source"];
    frameCache?: boolean;
}

interface BottomSheetProps {
    className?: string;
    bodyClassName?: string;
    open?: boolean;
    onCancel?: () => void;
    trigger?: ReactNode;
    header?: ReactNode;
    handle?: ReactNode;
    close?: ReactNode;
    children: ReactNode;
    type: "full" | "half";
}

interface BottomTabProps {
    className?: string;
    tabs: TabType[];
    height?: number;
    label?: string;
    renderTab?: (tab: TabType, active: boolean) => ReactNode;
}

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

type CSRProviderProps = ProviderProps & {
    fonts: ReactFont[];
};

declare function CardList<T extends string, Input, Full extends {
    id: string;
}, Light extends {
    id: string;
}, Filter extends FilterInstance>({ className, cardListClassName, init, slice, actions, columns, renderItem, renderLoading, renderTemplate, renderView, renderTitle, }: CardListProps<T, Input, Full, Light, Filter>): import("react").JSX.Element;

interface CardListProps<T extends string, Input, Full extends {
    id: string;
}, Light extends {
    id: string;
}, Filter extends FilterInstance> {
    className?: string;
    cardListClassName?: string;
    init?: FetchInitForm<Input, Filter>;
    slice: SliceMeta;
    columns: DataColumn<any>[];
    actions?: ((item: Light, idx: number) => DataAction[]) | DataAction[];
    renderItem: (args: DataItemProps<T, Full, Light>) => ReactNode;
    renderLoading?: () => ReactNode;
    renderTemplate?: (props: any) => ReactNode | null;
    renderView?: (model: Full) => ReactNode | null;
    renderTitle?: (model: Full) => ReactNode | string;
}

interface ChatCommandContext {
    session: AgentSession;
    l: (key: string) => string;
}

type ChatRole = "assistant" | "tool" | "user";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
    className?: string;
    checked: boolean;
    onChange: (checked: boolean, e: ChangeEvent<HTMLInputElement>) => void;
};

interface ChildrenIdProps<Light, Sort = unknown> extends RelationProps<Light, Sort> {
    value: null | string[];
    onChange: (value: string[]) => void;
    renderOption: (model: Light) => ReactNode;
}

interface ChildrenProps<Light, Sort = unknown> extends RelationProps<Light, Sort> {
    selectClassName?: string;
    value: Light[] | null;
    onChange: (value: Light[]) => void;
    renderOption: (model: Light) => ReactNode;
    renderSelected?: (value: Light) => ReactNode;
}

interface ClientSideProps {
    children: ReactNode;
    loading?: ReactNode;
}

interface ClipboardProps {
    text?: string;
    clipboardMessage?: string;
    className?: string;
}

interface Column {
    key?: string;
    title: ReactNode;
    dataIndex: string;
    render?: (text: any, record: any, idx: number) => React.ReactNode;
    responsive?: Responsive["value"][];
}

type CommonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href?: null | string;
    disabled?: boolean;
    scrollToTop?: boolean;
    replace?: boolean;
    activeClassName?: string;
    activeExact?: boolean;
    activeMatch?: string[];
    noCache?: boolean;
    prefetch?: LinkPrefetch;
};

interface ContentProps {
    className?: string;
    children?: ReactNode;
}

declare function Context({ className }: ContextProps): import("react").JSX.Element | null;

interface ContextProps {
    className?: string;
}

interface CopyProps {
    text?: string;
    copyMessage?: string;
    children: ReactNode;
}

type CsrImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src"> & {
    src?: string;
    alt?: string;
    file?: ProtoLightFile | null | {
        url: string;
        imageSize: [
            number,
            number
        ];
        abstractData?: null | string;
    };
    abstractData?: null | string;
    priority?: boolean;
    preload?: boolean;
    quality?: number;
    unoptimized?: boolean;
    fill?: boolean;
    placeholder?: string;
    blurDataURL?: string;
};

interface Cursor {
    className?: string;
    children: ReactNode;
}

declare function Dashboard<T extends string, State>({ className, summary, slice, queryMap, summaryRefName, onSelect, queryKey, columns, presents, hidePresents, }: DashboardProps<T, State>): import("react").JSX.Element | null;

interface DashboardProps<_T extends string, _State> {
    className?: string;
    summary: Record<string, unknown>;
    slice: SliceMeta;
    queryMap?: {
        [column: string]: QuerySetting;
    };
    summaryRefName?: string;
    onSelect?: (setting: QuerySetting, column: string) => void;
    queryKey?: string;
    columns?: string[];
    presents?: string[];
    hidePresents?: boolean;
}

type DataItemProps<T extends string, _M extends {
    id: string;
}, L extends {
    id: string;
}> = {
    [key in T]: L;
} & {
    slice: SliceMeta;
};

type DatabaseModelVariant = (typeof databaseModelVariants)[number];

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

// ui/Load/Edit_Client
interface DefaultProps {
    type?: "empty" | "form" | "modal";
    className?: string;
    modalClassName?: string;
    checkSubmit?: boolean;
    slice: SliceMeta;
    modal?: string;
    loading?: ReactNode;
    error?: StreamError;
    children?: ReactNode;
    onSubmit?: string;
    onCancel?: string;
    submitText?: string;
    submitClassName?: string;
    submitOption?: CreateOption<any>;
    renderSubmit?: boolean;
    draft?: DraftProp;
}

// ui/Load/Units
interface DefaultProps<L extends {
    id: string;
}> {
    containerRef?: RefObject<HTMLDivElement | null>;
    className?: string;
    style?: React.CSSProperties;
    noDiv?: boolean;
    from?: number;
    to?: number;
    loading?: ReactNode;
    error?: StreamError;
    filter?: (item: L, idx: number) => boolean;
    sort?: (a: L, b: L) => number;
    empty?: ReactNode;
    renderEmpty?: (() => ReactNode) | false | null;
    renderItem?: (item: L, idx: number) => ReactNode;
    renderList?: (list: DataList<L>) => ReactNode;
    reverse?: boolean;
    pagination?: boolean;
    staleTime?: number;
}

// ui/Load/View
interface DefaultProps<_T extends string, M> {
    className?: string;
    noDiv?: boolean;
    loading?: ReactNode;
    empty?: ReactNode;
    error?: StreamError;
    renderView: (model: M) => ReactNode;
}

interface DocAuthModalProps {
    children: ReactNode;
}

interface DocSettingProps {
    fetch?: FetchProxy;
    search?: string;
    onSearch?: (search: string) => void;
}

interface DocSignalProps {
    refName: string;
    fetch?: FetchProxy;
}

interface DocSignalsProps extends SignalScope {
    fetch?: FetchProxy;
}

interface DockProps {
    className?: string;
    bridge?: AgentBridge;
    surface?: AgenticSurface;
    open?: boolean;
}

interface DoubleNumberProps {
    label?: string;
    desc?: string;
    labelClassName?: string;
    className?: string;
    value: [
        number,
        number
    ] | null;
    inputClassName?: string;
    placeholder?: string;
    nullable?: boolean;
    disabled?: boolean;
    min?: [
        number,
        number
    ] | null;
    max?: [
        number,
        number
    ] | null;
    separator?: ReactNode | string;
    onChange: (value: [
        number,
        number
    ]) => void;
    transform?: (value: number) => number;
    validate?: (text: number) => boolean | string;
    onPressEnter?: () => void;
}

interface DraftBarViewProps {
    className?: string;
    refName: string;
    state: "applied" | "conflict";
    savedAt: Date;
    onRestore?: () => void;
    onDiscard: () => void;
}

type DraftProp = boolean | string;

interface DragActionProps {
    className?: string;
    children: ReactNode;
    onClick?: () => void;
    onLeft?: () => void;
    onRight?: () => void;
}

interface DragListProps<V> {
    className?: string;
    mode?: "horizontal" | "vertical";
    children: ReactElement[];
    onChange: (value: V[], draggedValue: V, info: {
        originalIdx: number;
        newIdx: number;
        idxChanged: boolean;
    }) => void;
    onRemove: (value: V, idx: number) => void;
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

// ui/Load/Edit
declare function Edit<T extends string, Full extends {
    id: string;
}>({ edit, ...props }: EditProps<T, Full>): import("react").JSX.Element;

// ui/Model/Edit
declare function Edit({ trigger, children, slice, modelId, modal, renderTitle, draft, presentation, placement, }: EditProps): import("react").JSX.Element;

declare function EditModal<Full extends {
    id: string;
}>({ type, slice, id, className, draftBarClassName, disabled, checkSubmit, modalClassName, presentation, placement, edit, modal, renderTitle, children, submitText, submitClassName, submitOption, renderSubmit, loadingWrapper, draft, onSubmit, onCancel, }: EditModalProps<Full>): import("react").JSX.Element | undefined;

interface EditModalProps<Full extends {
    id: string;
}> extends EditModelProps<Full>, ModalSurfaceProps {
    id?: string;
    disabled?: boolean;
    checkSubmit?: boolean;
    modalClassName?: string;
    renderTitle?: ((model: Full) => ReactNode | string) | string;
    submitText?: ReactNode;
    submitClassName?: string;
    submitOption?: CreateOption<Full>;
    renderSubmit?: ((arg: any) => ReactNode) | boolean;
    onSubmit?: ((model: Full) => void) | string;
    onCancel?: ((form?: any) => any) | string;
}

interface EditModelProps<Full> {
    type?: "empty" | "form" | "modal";
    slice: SliceMeta;
    className?: string;
    draftBarClassName?: string;
    checkSubmit?: boolean;
    edit?: ClientEdit<string, Full> | Partial<Full>;
    modal?: string;
    children: ReactNode;
    loadingWrapper?: ((props: {
        children?: any;
        className?: string;
    }) => ReactNode) | boolean;
    draft?: DraftProp;
}

// ui/Load/Edit_Client
interface EditProps<T extends string, Full extends {
    id: string;
}> extends DefaultProps {
    edit: ClientEdit<T, Full> | Partial<Full> | Promise<Partial<Full>>;
}

// ui/Model/Edit
interface EditProps extends ModalSurfaceProps {
    trigger?: ReactNode;
    children: ReactNode;
    slice: SliceMeta;
    modelId: string;
    modal?: null | string;
    renderTitle?: ((model: {
        id: string;
    }) => ReactNode | string) | string;
    draft?: DraftProp;
}

declare function EditWrapper({ children, slice, modelId, className, modal, disabled, resets, draft, }: EditWrapperProps): import("react").JSX.Element;

interface EditWrapperProps {
    className?: string;
    children: ReactNode;
    slice: SliceMeta;
    modelId: string;
    modal?: null | string;
    disabled?: boolean;
    resets?: null | string[];
    draft?: DraftProp;
}

// ui/Field/Text
interface EmailProps extends TextFieldProps {
    inputStyleType?: "bordered" | "borderless" | "underline";
}

// ui/Input
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

interface EnumProps {
    enums?: ReturnType<typeof getConstantSchemaDoc>["enums"];
}

interface EnumUsage {
    refName: string;
    variant: "scalar" | DatabaseModelVariant;
    fieldKey: string;
}

interface ExplorerProps extends SignalScope {
    className?: string;
    fetch?: FetchProxy;
    defaultRefName?: string;
    openAll?: boolean;
    groupBy?: "lib";
}

interface FieldProps {
    className?: string;
    containerClassName?: string;
    labelClassName?: string;
    label?: ReactNode;
    desc?: ReactNode;
    nullable?: boolean;
    children?: ReactNode;
}

interface FieldSchema {
    key: string;
    typeLabel: string;
    typeRefName?: string;
    typeKind: "database" | "map" | "primitive" | "scalar" | "unknown";
    required: boolean;
    nullable: boolean;
    arrDepth: number;
    fieldType: "hidden" | "property" | "resolve" | "secret";
    select: boolean;
    immutable: boolean;
    ref?: string;
    refPath?: string;
    refType?: "child" | "parent" | "relation";
    relationLabel?: string;
    enumRefName?: string;
    enumValues?: (number | string)[];
    defaultLabel?: string;
    exampleLabel?: string;
    constraints: string[];
    text?: TextFieldRole;
    meta: Record<string, unknown>;
    raw: ConstantField;
}

interface FontFaceProps {
    font: ReactFont;
}

interface GraphProps {
    className?: string;
    title?: string;
    nodes: SchemaGraphNode[];
    edges: SchemaGraphEdge[];
    selectedId?: null | string;
    onSelect?: (nodeId: string) => void;
}

interface GuideProps {
    instructions: string;
}

interface HeaderProps {
    className?: string;
    type?: "hide" | "static";
    children?: ReactNode;
    height?: number;
}

interface HttpRunnerOptions {
    url: string;
    headers?: () => Record<string, string>;
    fetcher?: typeof fetch;
}

type ImageLikeFile = ProtoLightFile | null | {
    url: string;
    imageSize: [
        number,
        number
    ];
    abstractData?: null | string;
};

interface InfiniteScrollProps {
    hasMore: boolean;
    onLoadMore: () => Promise<void>;
    children: React.ReactNode;
    reverse?: boolean;
    loading?: ReactNode;
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

declare function Insight<T extends string, Insight>({ className, insight, slice, columns, }: InsightProps<T, Insight>): import("react").JSX.Element | null;

interface InsightProps<_T extends string, Insight> {
    className?: string;
    insight: Insight;
    slice: SliceMeta;
    columns?: (keyof Insight)[];
}

declare function Item<T extends string, Full extends {
    id: string;
}, Light extends {
    id: string;
}>({ className, model, slice, onClick, title, actions, columns, children, }: ItemProps<T, Full, Light>): import("react").JSX.Element;
declare namespace Item {
    var StatusTag: ({ status, className }: {
        status: string;
        className?: string;
    }) => import("react").JSX.Element;
    var RoleTags: ({ role }: {
        role: string | string[];
    }) => import("react").JSX.Element | import("react").JSX.Element[];
}

// ui/Data/Item
interface ItemProps<_T extends string, _Full extends {
    id: string;
}, Light extends {
    id: string;
}> {
    className?: string;
    model: Light;
    slice: SliceMeta;
    onClick?: () => void;
    cover?: ReactNode;
    title?: ReactNode;
    actions?: DataAction[];
    columns?: DataColumn<any>[];
    children?: ReactNode;
}

// ui/DraggableList
interface ItemProps {
    value: any;
    children: ReactNode;
    className?: string;
    cursorClassName?: string;
    cursor?: boolean;
    removable?: boolean;
    removeClassName?: string;
}

// ui/Radio
interface ItemProps {
    value: number | string;
    children: ReactElement | ReactNode;
    className?: string;
    checked?: boolean;
    onChange?: (value: string) => void;
}

type JsonSchema = Record<string, unknown>;

interface KeyboardAvoidingProps {
    children: ReactNode;
    className?: string;
    keyboardSticky?: boolean;
}

interface LabelOption<T> {
    label: boolean | number | string;
    value: T;
}

interface LabelProps {
    className?: string;
    label: ReactNode;
    desc?: ReactNode;
    unit?: ReactNode;
    nullable?: boolean;
    mode?: "edit" | "view";
}

interface LangProps extends ActionProps {
    lang: "en" | "ko" | (string & {});
}

interface LeftProps {
    children: ReactNode;
}

interface LeftSiderProps {
    className?: string;
    children: ReactNode;
    open: boolean;
    width?: number | string;
    close?: ReactNode | false;
    onCancel: () => void;
}

// ui/Dialog/LegacyModal
interface LegacyModalProps {
    className?: string;
    bodyClassName?: string;
    confirmClose?: boolean;
    children?: ReactNode;
    onCancel?: () => void;
}

// ui/LegacyModal
interface LegacyModalProps {
    className?: string;
    title?: ReactNode | string;
    action?: ReactNode;
    open: boolean;
    onCancel: () => void;
    bodyClassName?: string;
    children?: ReactNode;
    confirmClose?: boolean;
}

type LinkPrefetch = "hover" | "viewport" | boolean;

declare function ListContainer<T extends string, State, Input, Full extends {
    id: string;
}, Light extends {
    id: string;
}>({ className, cardListClassName, type, query, queryMap, init, create, slice, title, sort, columns, actions, tools, renderDashboard, renderItem, renderTemplate, renderTitle, renderViewTitle, renderView, viewInUrl, viewActions, renderQueryMaker, renderInsight, renderLoading, }: ListContainerProps<T, State, Input, Full, Light>): import("react").JSX.Element;

interface ListContainerProps<_T extends string, _State, Input, Full extends {
    id: string;
}, Light extends {
    id: string;
}> {
    className?: string;
    cardListClassName?: string;
    type?: "card" | "list";
    query?: QuerySetting;
    queryMap?: {
        [column: string]: QuerySetting;
    };
    init?: FetchInitForm<Input, any>;
    slice: SliceMeta;
    create?: boolean;
    title?: ReactNode;
    sort?: unknown;
    columns?: DataColumn<any>[];
    tools?: ((modelList: Light[]) => DataTool[]) | DataTool[];
    actions?: ((item: Light, idx: number) => DataAction[]) | DataAction[];
    renderDashboard?: ({ summary, hidePresents, onSelect, queryKey, }: {
        summary: Record<string, unknown>;
        hidePresents?: boolean;
        onSelect: (setting: QuerySetting) => void;
        queryKey: string;
    }) => ReactNode;
    renderItem?: (props: ModelProps<any, any>) => ReactNode;
    renderTemplate?: (props: any) => ReactNode | null;
    renderTitle?: (model: Full) => ReactNode | string;
    renderViewTitle?: ((model: Full) => ReactNode | string) | false;
    renderView?: (model: Full) => ReactNode | null;
    viewInUrl?: boolean;
    viewActions?: boolean;
    renderQueryMaker?: () => ReactNode;
    renderInsight?: (props: ModelInsightProps) => ReactNode;
    renderLoading?: () => ReactNode;
}

interface ListProps<Item> {
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

interface ListenerResultProps {
    status: "error" | "listening" | "loading" | "ready";
    data: unknown;
}

declare function LoadInit<T extends string, Light extends {
    id: string;
}>({ init }: LoadInitProps<T, Light>): import("react").JSX.Element;

interface LoadInitProps<T extends string, Light extends {
    id: string;
}> {
    init: ClientInit<T, Light>;
}

declare function LoadView<T extends string, Light extends {
    id: string;
}>({ view }: LoadViewProps<T, Light>): import("react").JSX.Element;

interface LoadViewProps<T extends string, Model extends {
    id: string;
}> {
    view: ClientView<T, Model>;
}

interface MenuItem {
    label: ReactNode;
    key: string;
    children?: MenuItem[];
    icon?: ReactNode;
    type?: string;
}

// ui/Menu
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

// ui/Tab/Provider
interface MenuProps {
    className?: string;
    activeClassName?: string;
    disabledClassName?: string;
    disabled?: boolean;
    menu: string;
    children: ReactNode;
    scrollToTop?: boolean;
    tooltip?: ReactNode;
}

interface MenusProps {
    className?: string;
    children: ReactNode;
}

interface MessageTryProps {
    endpointKey: string;
    endpoint: SerializedEndpoint;
}

// ui/Dialog/Modal
interface ModalProps extends ModalSurfaceProps {
    className?: string;
    bodyClassName?: string;
    confirmClose?: boolean;
    closeButton?: ReactNode | false;
    children?: ReactNode;
    onCancel?: () => void;
}

// ui/Modal
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

interface ModelProps {
    refName?: string;
    database?: DatabaseSchema;
    openAll?: boolean;
}

interface ModelVariantSchema {
    refName: string;
    variant: "scalar" | DatabaseModelVariant;
    modelName: string;
    modelRef: ConstantCls;
    fields: FieldSchema[];
}

interface MoreProps {
    total: number;
    itemsPerPage: number;
    currentPage: number;
    hasMore: boolean;
    onLoadMore: () => Promise<void>;
    onPageSelect: (page: number, option?: {
        scrollToTop?: boolean;
    }) => void;
    children?: React.ReactNode;
    className?: string;
    reverse?: boolean;
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

interface MultiToggleSelectProps<I extends boolean | number | string> {
    className?: string;
    labelClassName?: string;
    label?: string;
    desc?: string;
    items: EnumInstance<string, I> | I[] | readonly I[] | {
        label: string;
        value: I;
        disabled?: boolean;
    }[];
    value: I[] | null;
    disabled?: boolean;
    minlength?: number;
    maxlength?: number;
    validate?: (value: I[]) => boolean | string;
    onChange: (value: I[]) => void;
}

type NativeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src" | "srcSet"> & {
    fill?: boolean;
    placeholder?: string;
    blurDataURL?: string;
};

interface NavbarProps {
    className?: string;
    children?: ReactNode;
    height?: number;
    title?: ReactNode;
    back?: ReactNode;
    backFallback?: string;
    left?: ReactNode;
    right?: ReactNode;
}

declare function New({ trigger, children, slice, modal, partial, renderTitle, namespace, draft, presentation, placement, }: NewProps): import("react").JSX.Element;

interface NewProps<Full = any> extends ModalSurfaceProps {
    trigger?: ReactNode;
    children: ReactNode;
    slice: SliceMeta;
    modal?: null | string;
    partial?: (() => Partial<Full>) | Partial<Full>;
    renderTitle?: ((model: {
        id: string;
    }) => ReactNode | string) | string;
    namespace?: string;
    draft?: DraftProp;
}

declare function NewWrapper<Full>({ partial, ...props }: NewWrapperProps<Full>): import("react").JSX.Element;

interface NewWrapperProps<Full = any> {
    className?: string;
    children: ReactNode;
    slice: SliceMeta;
    partial?: (() => Partial<Full>) | Partial<Full>;
    setDefault?: boolean;
    modal?: null | string;
    resets?: null | string[];
    namespace?: string;
    draft?: DraftProp;
}

// ui/Field/NumberField
interface NumberProps {
    label?: string;
    desc?: string;
    className?: string;
    value: null | number;
    placeholder?: string;
    nullable?: boolean;
    disabled?: boolean;
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

// ui/Input
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

interface ObjectDetailProps {
    className?: string;
    objRef: ConstantCls;
}

interface ObjectIdProps {
    id: string;
}

interface ObjectSchemaProps {
    objRef: Cls;
}

interface ObjectTypeProps {
    objRef: Cls;
    arrDepth: number;
    nullable?: boolean;
}

type Options<T> = EnumInstance<string, T> | LabelOption<T>[] | T[];

type OverlaySide = "bottom" | "left" | "right" | "top";

interface PageProps<Return> {
    of: (props: unknown) => ReactNode | null;
    loader: () => Promise<Return>;
    render: (data: Return) => ReactNode;
    loading?: () => ReactNode;
    noCache?: boolean;
}

// ui/Data/Pagination
declare function Pagination<T extends string>({ className, slice }: PaginationProps<T>): import("react").JSX.Element;

// ui/Load/Pagination
declare function Pagination<T extends string, L>({ className, init, scrollToTop, error, }: PaginationProps<T, L>): import("react").JSX.Element;

// ui/Data/Pagination
interface PaginationProps<_T extends string> {
    className?: string;
    slice: SliceMeta;
}

// ui/Load/Pagination
interface PaginationProps<RefName extends string, Light> {
    className?: string;
    init: ClientInit<RefName, Light>;
    scrollToTop?: boolean;
    error?: StreamError;
}

// ui/Pagination
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

interface PanelProps {
    className?: string;
    menu: string;
    children?: ReactNode;
    loading?: "eager" | "every" | "lazy";
}

interface ParentIdProps<Light, Sort = unknown> extends RelationProps<Light, Sort> {
    selectClassName?: string;
    value: null | string;
    onChange: (id: null | string, model: Light | null) => void;
    renderOption?: (model: Light) => ReactNode;
    renderSelected?: (value: Light) => ReactNode;
}

interface ParentProps<Light, Sort = unknown> extends RelationProps<Light, Sort> {
    selectClassName?: string;
    value: Light | null;
    onChange: (value: Light | null) => void;
    renderOption: (model: Light) => ReactNode;
    renderSelected?: (value: Light) => ReactNode;
}

// ui/Field/Text
interface PasswordProps extends TextFieldProps {
    confirmValue?: null | string;
    onChangeConfirm?: (value: string) => void;
    showConfirm?: boolean;
}

// ui/Input
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

interface PendingApproval {
    callId: string;
    name: string;
    args: Record<string, unknown>;
    message: string;
    approve: () => void;
    reject: (reason?: string) => void;
}

interface PendingCard {
    callId: string;
    name: string;
    args: Record<string, unknown>;
    render: ToolCard;
    submit: (value: unknown) => void;
    dismiss: (reason?: string) => void;
}

interface PendingQuestion {
    callId: string;
    question: string;
    choices: string[];
    multiple: boolean;
    answer: (value: string | string[]) => void;
    dismiss: (reason?: string) => void;
}

type PhoneProps = TextFieldProps;

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

interface PortalProps {
    children: ReactNode;
    id: string;
}

interface ProgressBarProps {
    className?: string;
    value: number;
    max: number;
}

// ui/Dialog/Provider
interface ProviderProps {
    className?: string;
    open?: boolean;
    defaultOpen?: boolean;
    namespace?: string;
    children?: ReactNode;
}

// ui/System/Common
interface ProviderProps {
    className?: string;
    appName: string;
    params: RootLayoutProps["params"];
    head?: ReactNode;
    manifest?: WebAppManifest;
    env?: object;
    theme?: AkanTheme;
    viewport?: RouteViewport;
    prefix?: string;
    children: ReactNode | ReactNode[];
    layoutStyle?: "mobile" | "web";
    reconnect?: boolean;
    wsConnect?: boolean;
    allDictionary?: Record<string, Record<string, Record<string, unknown>>>;
    of: (props: unknown) => ReactNode | null;
}

// ui/Tab/Provider
interface ProviderProps {
    className?: string;
    defaultMenu?: null | string;
    namespace?: string;
    children?: ReactNode;
}

interface PublishedResource {
    name: string;
    description?: string;
    value?: unknown;
    error?: string;
}

interface PublishedScope {
    path: string;
    label?: string;
    kind?: string;
}

declare function QueryMaker({ className, slice, query, onApply }: QueryMakerProps): import("react").JSX.Element;

interface QueryMakerProps {
    className?: string;
    slice: SliceMeta;
    query?: QuerySetting;
    onApply?: (setting: ResolvedQuerySetting) => void;
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

declare function RefPicker({ className, refName, value, onChange }: RefPickerProps): import("react").JSX.Element;

interface RefPickerProps {
    className?: string;
    refName: string;
    value: null | string;
    onChange: (id: null | string) => void;
}

interface RefreshProps {
    children: ReactElement;
    onRefresh: () => Promise<void>;
}

interface RelationProps<Light, Sort> {
    label?: string;
    desc?: string;
    labelClassName?: string;
    className?: string;
    disabled?: boolean;
    nullable?: boolean;
    initArgs?: any[];
    slice: SliceMeta<Sort>;
    limit?: number;
    sort?: NoInfer<Sort> & string;
    onSearch?: (text: string) => void;
    sortOption?: (a: Light, b: Light) => number;
}

declare function Remove({ className, name, modelId, slice, modal, redirect, title, description, action, children, }: RemoveProps): import("react").JSX.Element;

interface RemoveProps {
    className?: string;
    name?: string;
    modelId: string;
    slice: SliceMeta;
    modal?: null | string;
    redirect?: string;
    title?: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
}

declare function RemoveWrapper({ children, slice, name, modelId, className, modal }: RemoveWrapperProps): import("react").JSX.Element;

interface RemoveWrapperProps {
    className?: string;
    children: ReactNode;
    slice: SliceMeta;
    modelId: string;
    name: string;
    modal?: null | string;
}

interface ResolvedQuerySetting {
    queryKey: string;
    args: unknown[];
}

interface ResourceDiff {
    name: string;
    value?: unknown;
    error?: string;
    removed?: boolean;
}

interface ResourceEntry {
    name: string;
    description?: string;
    report?: boolean;
    read: () => unknown;
}

interface RestApiEndpointProps {
    refName: string;
    fetch?: FetchProxy;
    signalPrefix?: string;
    endpointKey: string;
    endpoint: SerializedEndpoint;
    open?: boolean;
    httpUri?: string;
}

interface RestApiEndpointsProps {
    refName: string;
    fetch?: FetchProxy;
    prefix?: string;
    endpoints?: string[];
    openAll?: boolean;
    httpUri?: string;
    search?: string;
}

interface RestApiInterfaceProps {
    refName: string;
    endpointKey: string;
    endpoint: SerializedEndpoint;
}

interface RestApiTryProps {
    signalPrefix?: string;
    refName: string;
    endpointKey: string;
    endpoint: SerializedEndpoint;
    fetch?: FetchProxy;
    httpUri?: string;
}

interface RightProps {
    children: ReactNode;
}

interface RightSiderProps {
    className?: string;
    children: ReactNode;
    open: boolean;
    title?: ReactNode;
    width?: number | string;
    close?: ReactNode | false;
    onCancel: () => void;
}

interface RootProps {
    children: ReactNode;
    st: unknown;
}

type SSRProviderProps = ProviderProps & {
    fonts?: ReactFont[];
};

interface ScalarProps {
    refName?: string;
    scalar?: ScalarSchema;
    openAll?: boolean;
}

interface SchemaGraphEdge {
    from: string;
    to: string;
    label: string;
}

interface SchemaGraphNode {
    id: string;
    refName: string;
    title: string;
    subtitle: string;
    kind: SchemaNodeKind;
}

type SchemaNodeKind = "database" | "external" | "scalar";

interface ScopeEntry {
    id: string;
    label?: string;
    kind?: string;
}

interface ScreenAction {
    name: string;
    description?: string;
    label?: string;
    needsConfirm: boolean;
    run: () => Promise<void>;
}

interface ScreenNavigatorProps {
    children: React.ReactNode;
    setMenu?: (menu: string) => void;
    menus: string[];
    namespace?: string;
}

declare function Section({ className, title, count, children, open }: SectionProps): import("react").JSX.Element;

interface SectionProps {
    className?: string;
    title: string;
    count: number;
    children: ReactNode;
    open?: boolean;
}

interface SelectLanguageProps {
    className?: string;
    languages?: string[];
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

interface SiderProps {
    className?: string;
    bgClassName?: string;
    trigger?: ReactNode;
    header?: ReactNode;
    close?: ReactNode;
    children?: ReactNode;
}

interface SignalScope {
    include?: string[];
    exclude?: string[];
    libs?: string[];
}

interface SkeletonProps {
    className?: string;
    active?: boolean;
    style?: CSSProperties;
}

interface SkipProps {
    className?: string;
    label: string;
    children: ReactNode;
}

interface SpinProps {
    className?: string;
    indicator?: ReactNode;
    isCenter?: boolean;
    size?: "lg" | "md" | "sm" | number;
    tone?: "current" | "muted" | "primary";
}

declare function StateKey({ className, bridge, name, entry, live }: StateKeyProps): import("react").JSX.Element;

interface StateKeyProps {
    className?: string;
    bridge: AgentBridge;
    name: string;
    entry: SerializedStoreState;
    live?: boolean;
}

declare function Stream<Value>({ of, fallback, error, children }: StreamProps<Value>): Iterable<ReactNode> | Promise<Iterable<ReactNode> | bigint | boolean | import("react").ReactElement<unknown, import("react").JSXElementConstructor<any> | string> | import("react").ReactPortal | null | number | string | undefined> | bigint | boolean | import("react").JSX.Element | null | number | string | undefined;

type StreamError = ((error: unknown, retry: () => void) => ReactNode) | ReactNode;

interface StreamProps<Value> {
    of: PromiseOrObject<Value>;
    fallback?: ReactNode;
    error?: StreamError;
    children: (value: Value) => ReactNode;
}

declare function SureToRemove({ className, modelId, name, slice, redirect, typeNameToRemove, trigger, title, description, confirmLabel, }: SureToRemoveProps): import("react").JSX.Element;

interface SureToRemoveProps {
    className?: string;
    modelId: string;
    name: string;
    slice: SliceMeta;
    redirect?: string;
    typeNameToRemove?: boolean;
    trigger?: ReactNode;
    title?: ReactNode;
    description?: ReactNode;
    confirmLabel?: ReactNode;
}

interface SurfaceSnapshot {
    tools: PublishedTool[];
    resources: PublishedResource[];
    scopes: PublishedScope[];
    guides: string[];
}

interface SurfaceSource {
    tools?: (view?: string[]) => ToolEntry[];
    resources?: (view?: string[]) => ResourceEntry[];
    subscribe?: (listener: () => void) => () => void;
}

interface SwitchProps {
    label?: string;
    desc?: string;
    labelClassName?: string;
    className?: string;
    value: boolean | null;
    onChange: (value: boolean) => void;
    inputClassName?: string;
    onDesc?: string;
    offDesc?: string;
    disabled?: boolean;
    variant?: "accent" | "primary" | "success";
}

interface TabType {
    name: ReactNode;
    icon?: ReactNode;
    activeIcon?: ReactNode;
    content?: ReactNode;
    activeContent?: ReactNode;
    notiCount?: number;
    href: string;
    exact?: boolean;
    match?: string[];
}

declare function TableList<T extends string, Input, Full extends {
    id: string;
}, Light extends {
    id: string;
}, Filter extends FilterInstance>({ className, init, queryArgs, slice, columns, actions, renderTemplate, renderTitle, renderView, onItemClick, }: TableListProps<T, Input, Full, Light, Filter>): import("react").JSX.Element;

interface TableListProps<_T extends string, Input, Full extends {
    id: string;
}, Light extends {
    id: string;
}, Filter extends FilterInstance> {
    className?: string;
    queryArgs?: any[];
    init?: FetchInitForm<Input, Filter>;
    slice: SliceMeta;
    columns: DataColumn<any>[];
    renderTemplate?: (props: any) => ReactNode | null;
    renderTitle?: (model: Full) => ReactNode | string;
    renderView?: (model: Full) => ReactNode | null;
    actions?: ((item: Light, idx: number) => DataAction[]) | DataAction[];
    onItemClick?: (item: Light, idx: number) => void;
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

interface TagsProps extends TextListProps {
    secret?: boolean;
}

interface TemplateProps {
    className?: string;
    children?: ReactNode;
}

// ui/Field/Text
interface TextAreaProps extends TextFieldProps {
    rows?: number;
}

// ui/Input
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

interface TextFieldProps {
    label?: string;
    desc?: string;
    labelClassName?: string;
    className?: string;
    value: null | string;
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
}

interface TextListProps {
    label?: string;
    desc?: string;
    labelClassName?: string;
    className?: string;
    value: null | string[];
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

interface TextProps extends TextFieldProps {
    inputStyleType?: "bordered" | "borderless" | "underline";
}

interface ThemeToggleProps {
    themes?: string[];
}

interface TimePickerProps {
    className?: string;
    value: Dayjs | null;
    onChange: (value: Dayjs) => void;
    disabled?: boolean;
    disabledDate?: (date: Dayjs) => boolean | null | undefined;
}

interface TitleProps {
    children?: ReactNode;
}

// ui/Field/Choice
interface ToggleSelectProps<I, Nullable extends boolean> {
    className?: string;
    labelClassName?: string;
    label?: string;
    desc?: string;
    model?: string;
    field?: string;
    items: EnumInstance<string, I> | I[] | readonly I[] | {
        label: string;
        value: I;
        disabled?: boolean;
    }[];
    value: I | null;
    nullable?: Nullable;
    disabled?: boolean;
    validate?: (value: I) => boolean | string;
    onChange: (value: Nullable extends true ? I | null : I) => void;
    btnClassName?: string;
}

// ui/ToggleSelect
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

declare function Tool({ className, surface, tool, onRun }: ToolProps): import("react").JSX.Element;

interface ToolActionEntry extends ToolEntryBase {
    run: (args: Record<string, unknown>) => unknown;
    card?: never;
}

interface ToolActivity {
    callId: string;
    name: string;
    args: Record<string, unknown>;
    phase: "end" | "start";
    error?: string;
}

interface ToolCallRequest {
    id: string;
    name: string;
    args: Record<string, unknown>;
}

interface ToolCallResult {
    id: string;
    name: string;
    result?: unknown;
    changes?: ResourceDiff[];
    error?: string;
    code?: string;
    attachments?: MessageAttachment[];
}

type ToolCard = (control: ToolCardControl) => ReactNode;

type ToolCardAnswer = {
    error: string;
} | {
    result: unknown;
};

interface ToolCardControl {
    args: Record<string, unknown>;
    submit: (value: unknown) => void;
    cancel: (reason?: string) => void;
}

interface ToolCardEntry extends ToolEntryBase {
    card: ToolCard;
    run?: never;
}

interface ToolCardRequest {
    callId: string;
    name: string;
    args: Record<string, unknown>;
    render: ToolCard;
}

type ToolConfirm = ((args: Record<string, unknown>) => boolean | string) | boolean | string;

type ToolEntry = ToolActionEntry | ToolCardEntry;

interface ToolEntryBase {
    name: string;
    description?: string;
    parameters?: JsonSchema;
    settle?: boolean;
    confirm?: ToolConfirm;
    taint?: "exempt" | "source";
    guard?: ToolGuard;
    label?: () => string | undefined;
}

type ToolGuard = (args: Record<string, unknown>) => string | true;

interface ToolProgress {
    callId: string;
    report: AgentProgressReport | null;
}

interface ToolProps {
    className?: string;
    surface: SurfaceView;
    tool: PublishedTool;
    onRun: () => void;
}

interface TopInsetProps {
    className?: string;
    children: ReactNode;
    estimatedHeight?: number;
}

interface TopLeftActionProps {
    className?: string;
    children: ReactNode;
}

declare function Transcript({ className, calls }: TranscriptProps): import("react").JSX.Element;

interface TranscriptProps {
    className?: string;
    calls: readonly AgentCall[];
}

type TriggerHandler = (event: MouseEvent<HTMLElement>) => void;

interface TriggerProps {
    className?: string;
    children?: ReactNode;
}

interface TriggerSlotOptions {
    className?: string;
    onClick?: TriggerHandler;
    as?: "div" | "span";
}

interface TurnLimits {
    window?: number;
    output?: number;
}

interface TurnOverflow {
    limit?: number;
    requested?: number;
}

type TurnStop = "end" | "length" | "toolUse";

interface TurnUsage {
    input: number;
    output: number;
}

interface UnauthorizedProps {
    className?: string;
    icon?: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    minHeight?: number;
}

interface UnitProps {
    className?: string;
    children: ReactNode;
    href?: string;
}

declare function Units<RefName extends string, Light extends {
    id: string;
}>({ noDiv, renderEmpty, pagination, ...props }: UnitsProps<RefName, Light>): import("react").JSX.Element;

interface UnitsProps<RefName extends string, Light extends {
    id: string;
}> extends DefaultProps<Light> {
    init: ClientInit<RefName, Light>;
}

// ui/Load/View
declare function View<T extends string, Full extends {
    id: string;
}>({ view, empty, ...props }: ViewProps<T, Full>): import("react").JSX.Element;

// ui/Model/View
declare function View<Full extends {
    id: string;
}>({ className, model, modelLoading, render, loadingWrapper, loading, empty, }: ViewProps<Full>): import("react").JSX.Element;

declare function ViewEditModal({ modalClassName, presentation, placement, viewClassName, slice, renderTitle, renderView, renderTemplate, menu, editLabel, saveLabel, }: ViewEditModalProps): import("react").JSX.Element;

interface ViewEditModalProps extends ModalSurfaceProps {
    modalClassName?: string;
    viewClassName?: string;
    slice: SliceMeta;
    renderTitle?: (model: any) => ReactNode | string;
    renderView: (model: any) => ReactNode | null;
    renderTemplate: () => ReactNode | null;
    menu?: ReactNode | false;
    editLabel?: ReactNode;
    saveLabel?: ReactNode;
}

declare function ViewModal({ id, modal, modalClassName, presentation, placement, viewClassName, slice, renderTitle, renderAction, renderView, }: ViewModalProps): import("react").JSX.Element;

interface ViewModalProps extends ModalSurfaceProps {
    id?: string;
    modal?: string;
    modalClassName?: string;
    viewClassName?: string;
    slice: SliceMeta;
    renderTitle?: (model: any) => ReactNode | string;
    renderAction?: (model: any) => ReactNode;
    renderView: (model: any) => ReactNode | null;
}

// ui/Layout/Role
interface ViewProps {
    className?: string;
    children: ReactNode;
}

// ui/Load/View
interface ViewProps<T extends string, Full extends {
    id: string;
}> extends DefaultProps<T, Full> {
    view: ClientView<T, Full>;
}

// ui/Model/View
interface ViewProps<Full extends {
    id: string;
}> {
    className?: string;
    model: Full | null;
    modelLoading?: boolean | string;
    render: (model: Full) => ReactNode | null;
    loadingWrapper?: ((props: {
        children?: any;
        className?: string;
    }) => ReactNode) | null;
    empty?: (() => ReactNode) | null;
    loading?: (() => ReactNode) | null;
}

declare function ViewWrapper({ children, slice, modelId, className, modal, resets }: ViewWrapperProps): import("react").JSX.Element;

interface ViewWrapperProps {
    className?: string;
    children: ReactNode;
    slice: SliceMeta;
    modelId: string;
    modal?: null | string;
    resets?: null | string[];
}

interface WebSocketEndpointsProps {
    refName: string;
    fetch?: FetchProxy;
    openAll?: boolean;
    search?: string;
}

interface WsEndpointProps {
    refName: string;
    endpointKey: string;
    endpoint: SerializedEndpoint;
    open?: boolean;
}

interface WsInterfaceProps {
    refName: string;
    endpointKey: string;
    endpoint: SerializedEndpoint;
}

// ui/Agent/Zone
interface ZoneProps {
    className?: string;
    id: string;
    label?: string;
    instructions?: string;
    runner?: AgentRunner;
    maxTurns?: number;
    compact?: CompactOptions;
    builtins?: BuiltinOption;
    persist?: PersistOption | SessionHistory;
    onCompact?: AgentSessionOptions["onCompact"];
    visual?: AgentVisualOption | boolean;
    session?: AgentSession;
    onSession?: (session: AgentSession) => void;
    children: ReactNode;
}

// ui/Constant/Doc
interface ZoneProps extends ConstantSchemaOptions {
    openAll?: boolean;
    groupBy?: "lib";
}

// ui/Layout/Role
interface ZoneProps {
    className?: string;
    children: ReactNode;
}

// ui/Signal/Doc
interface ZoneProps {
    refName: string;
    fetch?: FetchProxy;
    openAll?: boolean;
}

declare const databaseModelVariants: readonly [
    "input",
    "object",
    "full",
    "light",
    "insight"
];
```
