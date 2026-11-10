# `akanjs/store/agent`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare class AgentBridge {
    readonly refusals: AgentRefusal[];
    static of(): AgentBridge;
    constructor(instance: StoreInstance);
    get state(): {
        [key: string]: SerializedStoreState;
    };
    subscribe(listener: () => void): () => void;
    readableKeys(viewKey?: string): string[];
    read(key: string, viewKey?: string): unknown;
}

export declare class AgentContext {
    static of(): AgentContext;
    constructor(instance: StoreInstance, bridge: AgentBridge);
    blocks(surface: SurfaceView, view?: string[]): ContextBlock[];
}

export declare class AgentCursor {
    static readonly className = "akan-agent-cursor";
    static readonly travelMs = 320;
    static readonly travelFrom = 200;
    static readonly driftBy = 18;
    static readonly idleMs = 1400;
    static readonly thinkingClass = "akan-agent-cursor-thinking";
    static readonly scrollingClass = "akan-agent-cursor-scrolling";
    static press(target: HTMLElement): Promise<void>;
    static scroll(way: "down" | "up"): void;
    static hold(): void;
    static release(): void;
    static think(): void;
    static hide(): void;
}

export declare class AgentPrompts {
    static parseCommand(draft: string): null | {
        name: string;
        args: string[];
    };
    static messagesOf(result: PromptResult): ChatMessage[];
    static textOf(content: PromptContent): string;
}

export declare class AgentVisual {
    static readonly revealCap = 4;
    static readonly fieldCap = 5;
    static readonly leadMs = 600;
    static sink(option?: AgentVisualOption | boolean): undefined | {
        onActivity: (event: ToolActivity) => Promise<void> | void;
        onTurn: (running: boolean) => void;
    };
    static turn(running: boolean, { cursor }?: AgentVisualOption): void;
    static on(event: ToolActivity, { reveal, cursor }?: AgentVisualOption): Promise<void> | void;
}

export interface AgentVisualOption {
    reveal?: boolean;
    cursor?: boolean;
}

export declare class ScreenFlash {
    static readonly ringClass = "akan-agent-highlight";
    static readonly ringMs = 2400;
    static readonly actingClass = "akan-agent-acting";
    static readonly actingMs = 1000;
    static show(target: HTMLElement): void;
    static reveal(target: HTMLElement): "down" | "up";
    static inView(target: HTMLElement, margin?: number): boolean;
    static onTop(target: HTMLElement): boolean;
    static ring(target: HTMLElement, { className, ms }?: {
        className?: string | undefined;
        ms?: number | undefined;
    }): void;
    static whenStill(target: HTMLElement, done: () => void): void;
}

export declare class ScreenImage {
    static readonly maxEdge = 1568;
    static readonly quality = 0.85;
    static readonly loadMs = 10000;
    static find(src: string, root?: HTMLElement): HTMLImageElement | null;
    static view(image: HTMLImageElement): Promise<ScreenImageView>;
    static publiclyFetchable(url: string): boolean;
}

export interface ScreenImageView {
    attachment: MessageAttachment;
    size: string;
}

export interface ScreenReadOptions {
    images?: boolean;
}

export declare class ScreenReader {
    static readonly limit = 8000;
    static read(root?: HTMLElement | null, options?: ScreenReadOptions): string;
    static readFrom(heading: HTMLElement, root?: HTMLElement | null, options?: ScreenReadOptions): string;
    static anchorOf(heading: HTMLElement): string;
    constructor({ images }?: ScreenReadOptions);
}

export declare class ScreenSettle {
    static wait({ quietMs, appearMs, timeoutMs }?: ScreenSettleOptions): Promise<void>;
}

export interface ScreenSettleOptions {
    quietMs?: number;
    appearMs?: number;
    timeoutMs?: number;
}

export declare class ScreenTarget {
    static container(name: string, root?: HTMLElement | null): HTMLElement | null;
    static control(name: string, root?: HTMLElement | null): HTMLElement | null;
    static controls(name: string, root?: HTMLElement | null): HTMLElement[];
    static heading(text: string, root?: HTMLElement | null): HTMLElement | null;
    static find(name: string, root?: HTMLElement | null): HTMLElement | null;
    static containerNames(root?: HTMLElement | null): string[];
    static anchorNames(root?: HTMLElement | null): string[];
    static targetNames(root?: HTMLElement | null): string[];
    static linkedRoutes(root?: HTMLElement | null): string[];
    static routeOf(href: string): string;
    static visible(el: HTMLElement): boolean;
}

export interface SerializedStoreState {
    type: "boolean" | "date" | "list" | "map" | "number" | "object" | "string" | "unknown";
    refName?: string;
    modelType?: "full" | "input" | "insight" | "light";
    derived: boolean;
    role?: SliceStateKey;
}

export declare class StoreCatalogue {
    readonly state: {
        [key: string]: SerializedStoreState;
    };
    readonly refusals: AgentRefusal[];
    constructor(instance: StoreInstance);
}

export interface StoreSurface {
    bridge: AgentBridge;
    source: StoreSurfaceSource;
    surface: AgenticSurface;
}

export declare class StoreSurfaceSource implements SurfaceSource {
    static readonly builtins: readonly [
        "navigate",
        "goBack",
        "readScreen",
        "readState",
        "highlight",
        "viewImage"
    ];
    constructor(bridge?: AgentBridge);
    tools: (view?: string[]) => ToolEntry[];
}

export declare const databaseStateModelTypes: {
    readonly model: "full";
    readonly modelForm: "input";
    readonly defaultModel: "full";
};

export declare const ensureStoreSurface: () => StoreSurface;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
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

type JsonSchema = Record<string, unknown>;

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

interface ScopeEntry {
    id: string;
    label?: string;
    kind?: string;
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

type ToolCard = (control: ToolCardControl) => ReactNode;

interface ToolCardControl {
    args: Record<string, unknown>;
    submit: (value: unknown) => void;
    cancel: (reason?: string) => void;
}

interface ToolCardEntry extends ToolEntryBase {
    card: ToolCard;
    run?: never;
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
```
