# `akanjs/client`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export interface AkanHeadSnapshotNode {
    tag: "link" | "meta" | "title";
    attrs?: Record<string, string>;
    text?: string;
}

export interface AkanHeadSnapshotV1 {
    version: 1;
    nodes: AkanHeadSnapshotNode[];
}

export declare class AkanNotFoundError extends Error {
    readonly digest = "AKAN_NOT_FOUND";
    constructor();
}

export declare class AkanRedirectError extends Error {
    readonly location: string;
    readonly method: RedirectMethod;
    readonly status: RedirectStatus;
    readonly digest = "AKAN_REDIRECT";
    constructor(location: string, method?: RedirectMethod, status?: RedirectStatus);
}

export interface AllDictionary {
    [key: string]: Dictionary;
}

export type AnimatedDivProps = AnimatedComponent<"div"> extends ForwardRefExoticComponent<AnimatedProps<infer P>> ? P : never;

export interface ClientRuntime {
    msg: RuntimeMsg;
    Err: RuntimeErr;
    usePage: () => RuntimePage;
    fetch: RuntimeFetch;
    sig: Record<PropertyKey, unknown>;
}

export interface ContainerTransition {
    containerStyle: TransitionStyle;
    contentStyle: TransitionStyle;
    prevContentStyle: TransitionStyle;
}

export type CsrContextType = RouteState & UseCsrTransition;

export declare class CsrLocation {
    view(href: string): void;
    get href(): string;
    get pathname(): string;
    get search(): string;
    get hash(): string;
    get state(): unknown;
    strip(href: string): string;
    entry(): {
        idx: number | undefined;
        href: string;
    };
    observe(): {
        idx: number | undefined;
        href: string;
    };
    push(state: unknown, href: string): void;
    replace(state: unknown, href?: string): void;
    static idxOf(state: unknown): number | undefined;
    onBack(listener: (idx: number) => void): void;
    back(): void;
    assign(href: string): void;
    reload(): void;
}

export type CsrNavigationKind = "back" | "popBack" | "popForward" | "push" | "replace";

export type CsrNavigationPhase = "idle" | "preparing" | "transitioning";

export type CsrPageType = "cached" | "current" | "pending" | "prev";

export interface CsrStackAccount {
    token: null | string;
    generation: number;
    leaving?: {
        key: string;
        generation: number;
    };
}

export interface CsrStackEntry {
    key: string;
    location: Location;
    pageType: CsrPageType;
    zIndex: number;
}

export interface CsrState {
    transition: TransitionType;
    topSafeArea: number;
    bottomSafeArea: number;
    topInset: number;
    bottomInset: number;
    responsiveInset?: {
        top: ResponsiveInset;
        bottom: ResponsiveInset;
    };
    safeAreaEnv?: {
        top: boolean;
        bottom: boolean;
    };
    gesture: boolean;
    cache: boolean;
    ssr: SsrRenderMode;
    topSafeAreaColor?: string;
    bottomSafeAreaColor?: string;
}

export interface CsrTransitionStyles {
    topSafeArea: SafeAreaTransition | null;
    page: PageTransition | null;
    prevPage: PageTransition | null;
    topInset: ContainerTransition | null;
    bottomInset: ContainerTransition | null;
    topLeftAction: ContainerTransition | null;
    bottomSafeArea: SafeAreaTransition | null;
}

export declare const DEFAULT_BOTTOM_INSET = 60;

export declare const DEFAULT_TOP_INSET = 48;

export type DataAction = "edit" | "remove" | "view" | ReactElement | null | undefined;

export type DataColumn<L> = string | {
    key: keyof L;
    title?: string;
    value?: (value: any, model: L) => boolean | null | number | object | string | undefined;
    responsive?: boolean;
    render?: (value: any, model: L) => ReactNode;
    only?: "admin" | "user";
};

export interface DataMenu {
    [key: string]: DataMenuItem;
}

export interface DataMenuItem {
    key: string;
    icon: ReactNode;
    label?: string;
    render: () => ReactNode;
}

export interface DataTool {
    key: string;
    render: () => ReactNode;
}

export interface DeepLinkOptions extends RouteOptions {
    resetStack?: boolean;
}

export declare class Device {
    static instance: Device | null;
    static load({ lang, supportLanguages, }: {
        lang?: string;
        supportLanguages?: readonly string[] | string[];
    }): Promise<Device>;
    static getDevice(): Device;
    info: DeviceInfo;
    lang: string;
    topSafeArea: number;
    bottomSafeArea: number;
    isMobile: boolean;
    constructor({ lang, info, topSafeArea, bottomSafeArea, native }: DeviceInitOption);
    setPageContentRef(pageContentRef: RefObject<HTMLDivElement | null>): void;
    hideKeyboard(): Promise<void>;
    listenKeyboardChanged(onKeyboardChanged: (height: number) => void): void;
    unlistenKeyboardChanged(): void;
    vibrate(type?: "heavy" | "light" | "medium" | number): Promise<void>;
    getScrollTop(): number;
    setScrollTop(scrollTop: number): void;
}

export type DevicePlatform = "android" | "ios" | "web" | (string & {});

export interface Dictionary {
    [key: string]: {
        [key: string]: unknown;
    };
}

export declare const Err: RuntimeErr;

export type Font = ReactFont;

export interface FrameContentViewportState {
    top: number;
    bottom: number;
    height: number;
}

export type FrameLayer = "bottomChrome" | "keyboard" | "overlay" | "page" | "topChrome";

export interface FrameLayerZIndex {
    page: number;
    previousPage: number;
    cachedPage: number;
    topChrome: number;
    bottomChrome: number;
    keyboard: number;
    overlay: number;
}

export interface FrameLayoutState {
    viewport: FrameViewportState;
    keyboard: KeyboardFrameState;
    contentViewport: FrameContentViewportState;
    keyboardAccessory: KeyboardAccessoryFrameState;
    contentAnchor?: "bottom";
    platformProfile: FramePlatformProfile;
    zIndex: FrameLayerZIndex;
    pageStateByPath: Map<string, PageState>;
}

export type FramePlatformProfile = "android" | "ios" | "mobileWeb" | "web";

export type FrameSlotBucket = "active" | "pending";

export interface FrameSlotRegistration {
    scope?: FrameSlotScope;
    type: FrameSlotType;
    role?: FrameSlotRole;
    contentAnchor?: "bottom";
    height?: number;
    estimatedHeight?: number;
    source?: "bottomInset" | "bottomTab" | "navbar" | "topInset" | (string & {});
    cache?: boolean;
}

export type FrameSlotRole = "bottomChrome" | "keyboardAccessory" | "topChrome";

export type FrameSlotScope = "layout" | "page";

export type FrameSlotType = "bottomInset" | "topInset";

export interface FrameSnapshot {
    location: Location;
    pageState: PageState;
    viewport: FrameViewportState;
    frameSlots: FrameSlotRegistration[];
    measuredAt: number;
}

export interface FrameViewportState {
    width: number;
    height: number;
    visualWidth: number;
    visualHeight: number;
    visualOffsetTop: number;
}

export type GenerateHead = (props: PageProps) => PromiseOrObject<Head | null | undefined>;

export interface GetOption {
    unauthorize: string;
}

export type Head = ReactNode;

export type HeadProps = PageProps;

export interface History {
    type: "back" | "forward" | "initial";
    locations: Location[];
    scrollMap: Map<string, number>;
    idxMap: Map<string, number>;
    cachedLocationMap: Map<string, Location>;
    idx: number;
    dormant?: Set<string>;
    account?: CsrStackAccount;
}

export declare class Href {
    static isExternal(href: string): boolean;
    static hasWebScheme(href: string): boolean;
    static leavesOrigin(href: string, base: string | undefined): boolean;
    static toExternalUrl(href: string, base: string): string;
}

export type InsetBreakpoint = "base" | TailwindBreakpoint;

export declare const Inter: (_data: unknown) => null;

export interface KeyboardAccessoryFrameState {
    top: number;
    bottom: number;
    height: number;
    visible: boolean;
    slotHeight: number;
}

export interface KeyboardFrameState {
    height: number;
    offset: number;
    visible: boolean;
    sticky: boolean;
    frozen?: boolean;
    source?: "fallback" | "native" | "visualViewport";
    animationDuration?: number;
    animationEasing?: string;
}

export declare class LayoutDefinition<Args extends RouteArgsShape = Record<never, never>> extends RouteDefinition<Args, LayoutExtra> {
    readonly kind: RouteKind;
    param<Name extends string, Type extends RouteArgType>(name: Name, type: Type, option?: RouteArgOption): LayoutDefinition<Args & {
        [Key in Name]: RouteArgValue<Type>;
    }>;
    search<Name extends string, Type extends RouteSearchType>(name: Name, type: Type, option?: RouteArgOption): LayoutDefinition<Args & {
        [Key in Name]?: RouteArgValue<Type>;
    }>;
    notFound(render: LayoutNotFoundRender): this;
    error(render: LayoutErrorRender): this;
    protected extendModule(module: PageModule & LayoutModule): PageModule & LayoutModule;
}

export interface LayoutErrorProps extends LayoutNotFoundProps {
    error?: unknown;
    digest?: string;
}

export type LayoutErrorRender = (props: LayoutErrorProps) => PromiseOrObject<ReactNode>;

export interface LayoutExtra {
    children: ReactNode;
}

export interface LayoutFallbackRoute {
    path: string;
    pathSegments: string[];
    renderRootLayouts: RouteRender[];
    renderLayouts: RouteRender[];
}

export interface LayoutLoadingProps extends PageLoadingProps {
    children: ReactNode;
}

export type LayoutLoadingRender = (props: LayoutLoadingProps) => PromiseOrObject<ReactNode>;

export interface LayoutModule {
    default?: LayoutRender;
    pageConfig?: PageConfig;
    head?: Head;
    generateHead?: GenerateHead;
    guard?: RouteGuard;
    fonts?: ReactFont[];
    manifest?: WebAppManifest;
    theme?: string;
    reconnect?: boolean;
    wsConnect?: boolean;
    layoutStyle?: "mobile" | "web";
    viewport?: RouteViewport;
    Loading?: LayoutLoadingRender;
    NotFound?: LayoutNotFoundRender;
    Error?: LayoutErrorRender;
}

export interface LayoutNotFoundProps extends PageProps {
    pathname: string;
}

export type LayoutNotFoundRender = (props: LayoutNotFoundProps) => PromiseOrObject<ReactNode>;

export interface LayoutProps extends PageProps {
    children: ReactNode;
}

export type LayoutRender = (props: LayoutProps) => PromiseOrObject<ReactNode>;

export interface Location {
    href: string;
    pathname: string;
    search: string;
    params: {
        [key: string]: string;
    };
    searchParams: {
        [key: string]: string | string[];
    };
    pathRoute: PathRoute;
    hash: string;
    entryId?: string;
}

export interface LocationState {
    location: Location;
    prevLocation: Location | null;
    pendingLocation?: Location | null;
    navigationIntent?: NavigationIntent | null;
    phase: CsrNavigationPhase;
}

export interface MenuItem {
    icon?: ReactNode;
    title: ReactNode | string;
    href: string;
    hide?: "mobile" | "pc";
    children?: MenuItem[];
    onClick?: () => void;
}

export interface ModelDashboardProps<Summary> {
    className?: string;
    summary: Summary;
    queryMap?: {
        [column: string]: QuerySetting;
    };
    columns?: (keyof Summary)[];
    hidePresents?: boolean;
    slice?: SliceMeta;
}

export interface ModelEditProps {
    slice?: SliceMeta;
}

export interface ModelInsightProps<Insight = BaseInsight> {
    className?: string;
    insight: Insight;
    slice?: SliceMeta;
}

export type ModelProps<T extends string, L extends {
    id: string;
}> = {
    [key in T]: L;
} & {
    className?: string;
    slice?: SliceMeta;
    onClick?: (model: L) => unknown;
    actions?: DataAction[];
    columns?: DataColumn<L>[];
    href?: string;
};

export interface ModelViewProps {
    id?: string;
    slice?: SliceMeta;
}

export interface ModelsProps<M extends {
    id: string;
}> {
    className?: string;
    slice?: SliceMeta;
    query?: QuerySetting;
    init?: FetchInitForm<any, any>;
    onClickItem?: (model: M) => unknown;
}

export declare const Nanum_Gothic_Coding: (_data: unknown) => null;

export interface NavigationAttempt {
    kind: NavigationKind;
    from: string;
    to: null | string;
}

export type NavigationGuard = (navigation: NavigationAttempt) => Promise<boolean> | boolean;

export interface NavigationIntent {
    id: number;
    kind: CsrNavigationKind;
    from: Location;
    to: Location;
    scrollTop: number;
    scrollToTop?: boolean;
    createdAt: number;
}

export type NavigationKind = "back" | "pop" | "push" | "replace";

export declare class NavigationRefused extends Error {
    constructor(navigation: NavigationAttempt);
}

export declare const Noto_Sans_KR: (_data: unknown) => null;

export type PageActivity = "current" | "hidden" | "pending" | "prev";

export interface PageActivityState {
    activity: PageActivity;
    focused: boolean;
}

export interface PageConfig {
    transition?: TransitionType;
    safeArea?: PageSafeAreaConfig;
    topInset?: ResponsiveInset | boolean | number;
    bottomInset?: ResponsiveInset | boolean | number;
    gesture?: boolean;
    cache?: boolean;
    ssr?: SsrRenderMode;
    rscPatchHeadSafe?: boolean;
    topSafeAreaColor?: string;
    bottomSafeAreaColor?: string;
    devOnly?: boolean;
}

export declare class PageDefinition<Args extends RouteArgsShape = Record<never, never>, Apps extends RouteArgsShape = Record<never, never>> extends RouteDefinition<Args> {
    static readonly promptName: RegExp;
    static readonly commaSeparated = "Comma-separated list.";
    readonly kind: "page";
    param<Name extends string, Type extends RouteArgType>(name: Name & FreeName<Name, Apps>, type: Type, option?: RouteArgOption): PageDefinition<Args & {
        [Key in Name]: RouteArgValue<Type>;
    }, Apps>;
    search<Name extends string, Type extends RouteSearchType>(name: Name & FreeName<Name, Apps>, type: Type, option?: RouteArgOption): PageDefinition<Args & {
        [Key in Name]?: RouteArgValue<Type>;
    }, Apps>;
    prompt(name: string, description: string): this;
    app<Name extends string>(name: Name & FreeName<Name, Args & Apps>, description: string, load: (args: RouteBaseArgs & Args) => PromiseOrObject<ReactNode>): PageDefinition<Args, Apps & {
        [Key in Name]: ReactNode;
    }>;
    render(render: (args: RouteBaseArgs & Args & Apps) => PromiseOrObject<ReactNode>): this;
    get promptMeta(): RoutePromptMeta | undefined;
    get appMetas(): RoutePromptMeta[];
    loadApp(name: string, args: RouteBaseArgs & Args): Promise<ReactNode>;
    protected declare(arg: RouteArgInfo): void;
    protected renderArgsOf(args: RouteBaseArgs & Args): PromiseOrObject<RouteBaseArgs & Args>;
}

export interface PageLoadingProps {
    params: {
        [key: string]: string;
    };
}

export type PageLoadingRender = (props: PageLoadingProps) => PromiseOrObject<ReactNode>;

export interface PageModule {
    default?: PageRender;
    pageConfig?: PageConfig;
    head?: Head;
    generateHead?: GenerateHead;
    Loading?: PageLoadingRender;
    guard?: RouteGuard;
}

export interface PageProps {
    params: {
        [key: string]: string;
    };
    searchParams: {
        [key: string]: string | string[];
    };
}

export type PageRender = (props: PageProps) => PromiseOrObject<ReactNode>;

export type PageSafeAreaConfig = "bottom" | "top" | boolean | {
    top?: boolean;
    bottom?: boolean;
    android?: "auto" | "edge-to-edge" | "none";
};

export type PageState = CsrState & {
    topInset: number;
    bottomInset: number;
};

export interface PageTransition {
    containerStyle: TransitionStyle;
    contentStyle: TransitionStyle;
}

export interface PathContextType {
    pageType: CsrPageType;
    pageKey?: string;
    location: Location;
    followsRouter?: boolean;
    prefix?: string;
    gestureEnabled: boolean;
    setGestureEnabled: (enabled: boolean) => void;
    registerFrameSlot: (slot: FrameSlotRegistration) => () => void;
}

export interface PathRoute {
    path: string;
    pathSegments: string[];
    renderPage: RouteRender;
    pageState: PageState;
    pageConfigChain?: PageConfig[];
    explicitPageConfigKeys?: Partial<Record<keyof PageConfig, boolean>>;
    renderRootLayouts: RouteRender[];
    renderLayouts: RouteRender[];
    resolveHead?: ResolveHead;
}

export type PrefetchPriority = "high" | "low";

export interface ReactFont {
    name: string;
    default?: boolean;
    paths: ReactFontPath[];
    styles?: ReactFontStyle[];
    display?: ReactFontDisplay;
    preload?: boolean;
    fallbacks?: string[];
    fallbackName?: string;
    subsets?: ReactFontSubset[];
    subsetText?: string;
    subsetFiles?: string[];
    subset?: false;
    category?: ReactFontCategory;
    variable?: string;
    className?: string;
    declarations?: ReactFontDeclaration[];
    adjustFontFallback?: boolean;
    optimize?: boolean;
}

export type ReactFontCategory = "display" | "monospace" | "sans-serif" | "serif";

export interface ReactFontDeclaration {
    prop: string;
    value: string;
}

export type ReactFontDisplay = "auto" | "block" | "fallback" | "optional" | "swap";

export interface ReactFontFace {
    font: ReactFont;
    path: ReactFontPath;
    src: string;
    weight: number | string;
    style: ReactFontStyle;
    optimizedSrc: string;
}

export interface ReactFontPath {
    src: string;
    weight: number | string;
    style?: ReactFontStyle;
    preload?: boolean;
    declarations?: ReactFontDeclaration[];
}

export type ReactFontStyle = "italic" | "normal" | "oblique";

export type ReactFontSubset = "auto" | "ks-x-1001" | "latin" | "latin-ext" | (string & {});

export type RedirectMethod = "push" | "replace";

export interface RedirectOptions {
    method?: RedirectMethod;
    status?: RedirectStatus;
    external?: boolean;
}

export type RedirectStatus = 303 | 307 | 308;

export type ResolveHead = (props: PageProps) => PromiseOrObject<ResolveHeadResult>;

export type ResolveHeadResult = Head | ResolvedHead | null | undefined;

export interface ResolvePageStateOptions {
    configChain?: PageConfig[];
    path: string;
    basePath?: string;
    platform: DevicePlatform;
    deviceSafeArea: SafeAreaInsets;
    cssSafeArea?: SafeAreaInsets;
    width?: number;
}

export interface ResolveRouteModuleOption {
    kind?: "layout" | "overrides" | "page";
    pattern?: string;
}

export interface ResolvedHead {
    node: Head | null | undefined;
    headSnapshot?: AkanHeadSnapshotV1;
}

export interface ResolvedRouteModule {
    module: RouteModule;
    definition?: RouteDefinition;
}

export interface ResponsiveInset extends Partial<{
    [name in TailwindBreakpoint]: number;
}> {
    base: number;
}

export declare const Roboto: (_data: unknown) => null;

export declare class RootLayoutDefinition<Args extends RouteArgsShape = Record<never, never>> extends LayoutDefinition<Args> {
    readonly kind: RouteKind;
    fonts(fonts: ReactFont[]): this;
    manifest(manifest: WebAppManifest): this;
    theme(theme: string): this;
    reconnect(on?: boolean): this;
    wsConnect(on?: boolean): this;
    layoutStyle(style: "mobile" | "web"): this;
    viewport(viewport: RouteViewport): this;
    protected extendModule(module: PageModule & LayoutModule): PageModule & LayoutModule;
}

export interface RootLayoutProps {
    children: ReactNode;
    params: {
        lang: "en" | "ko" | (string & {});
    };
}

export interface Route {
    PageConfig?: PageConfig;
    pageConfig?: PageConfig;
    layoutPageConfig?: PageConfig;
    path: string;
    renderPage?: RouteRender;
    renderLayout?: RouteRender;
    isRootLayout?: boolean;
    renderOverrides?: RouteRender;
    pageIncludesOwnLayout?: boolean;
    loader?: () => unknown;
    pageState?: PageState;
    pageConfigChain?: PageConfig[];
    explicitPageConfigKeys?: Partial<Record<keyof PageConfig, boolean>>;
    children: Map<string, Route>;
}

export declare class RouteArgError extends Error {
    readonly arg: RouteArgInfo;
    constructor(arg: RouteArgInfo, message: string);
}

export interface RouteArgInfo {
    kind: "param" | "search";
    name: string;
    type: RouteArgType;
    list: boolean;
    desc?: string;
}

export interface RouteArgInput {
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
}

export interface RouteArgOption {
    desc?: string;
}

export declare class RouteArgPending extends Error {
    readonly digest = "AKAN_ROUTE_ARG_PENDING";
    constructor(name: string);
}

export interface RouteArgResolveOption {
    strict?: boolean;
}

export type RouteArgType = ParamFieldType;

export type RouteArgValue<T> = T extends [
    infer Item
] ? FieldToValue<Item>[] : FieldToValue<T>;

export type RouteArgsShape = Record<string, unknown>;

export interface RouteBaseArgs {
    lang: string;
}

export declare abstract class RouteDefinition<Args extends RouteArgsShape = Record<never, never>, Extra extends object = Record<never, never>> {
    readonly [routeDefinitionMarker] = true;
    abstract readonly kind: RouteKind;
    readonly args: RouteArgInfo[];
    config(config: PageConfig): this;
    head(head: HeadStage<RouteBaseArgs & Args>): this;
    guard(guard: (args: RouteBaseArgs & Args) => Promise<void> | void): this;
    loading(render: (args: RouteBaseArgs & Args & Extra) => PromiseOrObject<ReactNode>): this;
    render(render: (args: RouteBaseArgs & Args & Extra) => PromiseOrObject<ReactNode>): this;
    get pageConfig(): PageConfig | undefined;
    protected declare(arg: RouteArgInfo): void;
    resolveArgs(input: RouteArgInput, { strict }?: RouteArgResolveOption): Record<string, unknown>;
    assertPattern(pattern: string, key: string): void;
    toRouteModule(): PageModule & LayoutModule;
    protected extendModule(module: PageModule & LayoutModule): PageModule & LayoutModule;
    protected renderArgsOf(args: RouteBaseArgs & Args & Extra): PromiseOrObject<RouteBaseArgs & Args & Extra>;
    static renderArgsKey(render: unknown, props: {
        params: Record<string, string>;
        searchParams?: Record<string, string | string[]>;
    }, { isPage, paramNames }: {
        isPage: boolean;
        paramNames?: string[];
    }): string;
}

export type RouteGuard = (props: RouteGuardProps) => Promise<void>;

export interface RouteGuardProps {
    params: Record<string, string>;
    searchParams: Record<string, string | string[]>;
    listing?: boolean;
}

export declare class RouteGuards {
    static run(renders: (RouteRender | undefined)[], props: RouteGuardProps): Promise<void>;
    static refusedAt(error: unknown): number | undefined;
    static admits(renders: (RouteRender | undefined)[], props: RouteGuardProps): Promise<boolean>;
    static refusalOf(error: unknown): unknown;
    static isArgPending(error: unknown): boolean;
    static compose(...guards: (RouteGuard | undefined)[]): RouteGuard | undefined;
}

export interface RouteGuide {
    pathSegment: string;
    pathRoute?: PathRoute;
    notFoundRouteOf?: (pathname: string) => PathRoute;
    children: {
        [key: string]: RouteGuide;
    };
}

export declare class RouteHead {
    static merge(levels: ResolveHeadResult[]): ResolveHeadResult;
    static mergePage(layouts: ResolveHeadResult, page: ResolveHeadResult): ResolveHeadResult;
    static split(node: ReactNode): {
        tags: ReactNode[];
        rest: ReactNode;
    };
    static noindexOver(node: ReactNode): ReactElement;
    static keyOf(tag: string, props: TagProps): null | string;
    static mergeNodes(nodes: ReactNode[]): ReactNode;
}

export type RouteKind = "layout" | "page" | "rootLayout";

export interface RouteManifest {
    routes: string[];
}

export type RouteModule = LayoutModule | PageModule;

export type RouteModuleSource = RouteModule | {
    default: RouteDefinition;
};

export interface RouteOptions {
    scrollToTop?: boolean;
    shallow?: boolean;
    external?: boolean;
}

export interface RoutePromptArgument {
    name: string;
    description?: string;
    required: boolean;
}

export interface RoutePromptMeta {
    name: string;
    description: string;
    arguments: RoutePromptArgument[];
}

export interface RouteRender {
    render: LayoutRender | PageRender;
    isAsync?: boolean;
    kind?: "layout" | "page";
    paramNames?: string[];
    Loading?: LayoutLoadingRender | PageLoadingRender;
    resolveLoading?: () => Promise<void> | void;
    NotFound?: LayoutNotFoundRender;
    Error?: LayoutErrorRender;
    resolveNotFound?: () => PromiseOrObject<LayoutNotFoundRender | undefined>;
    resolveError?: () => PromiseOrObject<LayoutErrorRender | undefined>;
    resolveHead?: ResolveHead;
    checkArgs?: (props: PageProps) => Promise<void>;
    guard?: RouteGuard;
    getPageConfig?: () => PromiseOrObject<PageConfig | undefined>;
    getLayoutPageConfig?: () => PromiseOrObject<PageConfig | undefined>;
    getLayoutTheme?: () => PromiseOrObject<string | undefined>;
    getLayoutViewport?: () => PromiseOrObject<RouteViewport | undefined>;
    getLayoutManifest?: () => PromiseOrObject<WebAppManifest | undefined>;
    getRouteDefinition?: () => PromiseOrObject<RouteDefinition | undefined>;
}

export type RouteSearchType = RouteArgType | [
    RouteArgType
];

export interface RouteState {
    clientWidth: number;
    clientHeight: number;
    location: Location;
    prevLocation: Location | null;
    pendingLocation: Location | null;
    stackEntries: CsrStackEntry[];
    navigationIntent: NavigationIntent | null;
    phase: CsrNavigationPhase;
    isBackgrounded: boolean;
    history: RefObject<History>;
    topSafeAreaRef: RefObject<HTMLDivElement | null>;
    bottomSafeAreaRef: RefObject<HTMLDivElement | null>;
    prevPageContentRef: RefObject<HTMLDivElement | null>;
    pageContentRef: RefObject<HTMLDivElement | null>;
    frameRootRef: RefObject<HTMLDivElement | null>;
    onBack: RefObject<{
        [K in TransitionType]?: () => Promise<void>;
    }>;
    router: RouterInstance;
    pathRoutes: PathRoute[];
    registerFrameSlot: (path: string, slot: FrameSlotRegistration, bucket?: FrameSlotBucket) => () => void;
    frameLayout: FrameLayoutState;
}

export interface RouteViewport {
    fitCover?: boolean;
    interactiveWidget?: "overlays-content" | "resizes-content" | "resizes-visual";
    themeColor?: string | {
        [theme: string]: string;
    };
}

export interface RouterInstance {
    push: (href: string, routeOptions?: RouteOptions) => Promise<void> | void;
    replace: (href: string, routeOptions?: RouteOptions) => Promise<void> | void;
    back: (routeOptions?: RouteOptions) => void;
    refresh: () => void;
    canGoBack?: () => boolean;
    prefetch?: (href: string, priority?: PrefetchPriority) => void;
}

export interface RouterProps {
    push: (path: string) => void;
    replace: (path: string) => void;
    refresh: () => void;
    back: () => Promise<void> | void;
}

export type SafeAreaInsets = {
    top: number;
    bottom: number;
};

export interface SafeAreaTransition {
    containerStyle: TransitionStyle;
}

export type SsrRenderMode = "block" | "stream";

export type TailwindBreakpoint = (typeof insetBreakpoints)[number][0];

export interface ThemeColorTag {
    content: string;
    media?: string;
}

export declare const Toast: ({ root, duration }?: ToastProps) => (target: any, key: string, descriptor: PropertyDescriptor) => void;

export interface TransMessageOption {
    key?: string;
    duration?: number;
    data?: Record<string, unknown>;
}

export interface TransitionAction {
    type: "bottomChrome" | "keyboard" | "page" | "safeArea" | "topChrome" | (string & {});
    run: (ctx: TransitionActionContext) => Promise<void> | void;
}

export interface TransitionActionContext {
    plan: TransitionPlan;
}

export interface TransitionPlan {
    id: number;
    intent: NavigationIntent;
    type: TransitionType;
    direction: "back" | "forward";
    fromFrame: FrameSnapshot;
    toFrame: FrameSnapshot;
    actions: TransitionAction[];
    duration: number;
}

export type TransitionStyle = AnimatedDivProps["style"];

export type TransitionType = (typeof transitionTypes)[number];

export declare class Translator {
    constructor(dictionary: Record<string, Record<string, Record<string, unknown>>>);
    hasDictionary(lang: string): boolean;
    static hasLocale(lang: string): boolean;
    static setActiveLocale(lang: string | undefined): void;
    static getActiveLocale(): string | undefined;
    static setActivePath(path: string | undefined): void;
    static getActivePath(): string | undefined;
    static renderAt<T>(path: string | undefined, render: () => T): T;
    static getRenderPath(): string | undefined;
    static markHydrated(): void;
    static translateByLocale(lang: string, key: string, param?: Record<string, number | string>): string;
    static fillFromDefault(allDictionary: AllDictionary, lang: string, defaultLocale: string): Dictionary;
    static seed(lang: string, dict: Dictionary | undefined): void;
    static replace(lang: string, dict: Dictionary | undefined): void;
    translate(lang: string, key: string, param?: Record<string, number | string>): string;
    getDictionary(lang: string): Promise<Dictionary>;
}

export type UseCsrTransition = CsrTransitionStyles & {
    pageBind: (...args: unknown[]) => ReactDOMAttributes;
    pageClassName: string;
    transDirection: "horizontal" | "none" | "vertical";
    transUnitRange: number[];
    transUnit: SpringValue<number>;
    transPercent: Interpolation<number>;
    transProgress: Interpolation<number>;
};

export interface UserMenuItem {
    title: ReactNode | string;
    icon?: ReactNode;
    path: string;
    query?: Record<string, unknown>;
    children?: UserMenuItem[];
    onClick?: () => void;
}

export declare class ViewportMeta {
    static content(viewport: RouteViewport | undefined, { native }?: {
        native?: boolean;
    }): string;
    static themeColors(viewport: RouteViewport | undefined, theme?: string): ThemeColorTag[];
    static applyContent(viewport: RouteViewport | undefined, { native }?: {
        native?: boolean;
    }): void;
    static applyThemeColor(viewport: RouteViewport | undefined, theme?: string): void;
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

export interface WebAppManifestIcon {
    src: string;
    sizes?: string;
    type?: string;
    purpose?: string;
    [key: string]: unknown;
}

export declare const assertGuardOnChain: (label: string, resolved: ResolvedRouteModule) => ResolvedRouteModule;

export declare const authTokenKey: () => string;

export declare const breakpointQuery: (name: TailwindBreakpoint, { below }?: {
    below?: boolean;
}) => string;

export declare const clearRscNavigationCache: () => void;

export declare const cn: (...inputs: ClassNameValue[]) => string;

export declare const colorTokens: string[];

export declare const cookieJar: () => CookieJar;

export declare const cookies: () => Map<string, CookieEntry>;

export declare const createFont: (_data: unknown) => null;

export declare const csrContext: import("react").Context<CsrContextType>;

export declare const csrLocation: CsrLocation;

export declare function debugFrame(event: string, payload?: DebugPayload): void;

export declare const defaultPageState: PageState;

export declare const desktopPlatform: () => "linux" | "macos" | "windows" | null;

export declare const dictionaryContext: import("react").Context<{
    [key: string]: {
        [key: string]: string;
    };
}>;

export declare const fetch: RuntimeFetch;

export declare const getAccount: <AddData = unknown>() => Account<AddData>;

export declare const getAuthToken: () => string | undefined;

export declare const getClientRuntime: () => ClientRuntime;

export declare const getCookie: (key: string) => string | undefined;

export declare const getExplicitPageConfigKeys: (configChain?: PageConfig[]) => Partial<Record<keyof PageConfig, boolean>>;

export declare const getFontFaces: (font: ReactFont) => ReactFontFace[];

export declare const getFontFallbackName: (font: ReactFont) => string;

export declare const getFontStyles: (font: ReactFont) => ReactFontStyle[];

export declare const getFontVariableName: (font: ReactFont) => string;

export declare const getHeader: (key: string) => string | undefined;

export declare const getOptimizedFontSrc: (font: ReactFont, path: ReactFontPath) => string;

export declare const getPathInfo: (requestUrl: string, lang: string, prefix: string, localePrefix?: AkanLocalePrefix | undefined) => {
    path: string;
    pathname: string;
    hash: string;
    search: string;
    href: string;
};

export declare const getSessionClaims: () => string | undefined;

export declare const getStoredAuthToken: () => Promise<string | undefined>;

export declare const getWebManifestBasePath: (pathname: string, basePaths: readonly string[], headerBasePath?: null | string) => null | string | undefined;

export declare const headers: () => Map<string, string>;

export declare const initAuth: ({ jwt }?: InitAuthOption) => void;

export declare const insetAt: (inset: PageConfig["topInset"], width?: number) => number;

export declare const insetBreakpoints: readonly [
    readonly [
        "sm",
        40
    ],
    readonly [
        "md",
        48
    ],
    readonly [
        "lg",
        64
    ],
    readonly [
        "xl",
        80
    ],
    readonly [
        "2xl",
        96
    ]
];

export declare const insetsByBreakpoint: (inset: PageConfig["topInset"]) => {
    [bp in InsetBreakpoint]: number;
};

export declare const isClientRuntimeRegistered: () => boolean;

export declare const isFontOptimizationEnabled: (font: ReactFont) => boolean;

export declare const isFontPreloadEnabled: (font: ReactFont) => boolean;

export declare const isMcpView: () => boolean;

export declare const isMobileDevice: () => boolean;

export declare const isNativeApp: () => boolean;

export declare const isNativeShell: () => boolean;

export declare const isNativeTarget: () => boolean;

export declare const isResponsiveInset: (inset: PageConfig["topInset"]) => inset is ResponsiveInset;

export declare const isRouteDefinition: (value: unknown) => value is RouteDefinition;

export declare const isRscNavigationFromCache: () => boolean;

export declare const layout: () => LayoutDefinition<Record<never, never>>;

export declare const loadFonts: <T extends ReactFont[]>(fonts: T) => T;

export declare const makePageProto: <Dict extends {
    __Dict_Key__: string;
    __Error_Key__: string;
}, DictKey extends Dict["__Dict_Key__"] = Dict["__Dict_Key__"], ErrorKey extends Dict["__Error_Key__"] = Dict["__Error_Key__"]>(dictionary: {
    [key: string]: {
        [key: string]: Record<string, unknown>;
    };
}) => {
    Err: PageErrConstructor<ErrorKey>;
    msg: {
        info: (key: DictKey, option?: TransMessageOption) => void;
        success: (key: DictKey, option?: TransMessageOption) => void;
        error: (key: DictKey | ErrorKey, option?: TransMessageOption) => void;
        warning: (key: DictKey, option?: TransMessageOption) => void;
        loading: (key: DictKey, option?: TransMessageOption) => void;
    };
    usePage: () => {
        path: string;
        l: {
            (key: DictKey, param?: {
                [key: string]: number | string;
            }): string;
            _(key: string, param?: {
                [key: string]: number | string;
            }): string;
            rich(key: DictKey, param?: {
                [key: string]: number | string;
            }): ReactNode;
            trans<Returns extends ReactNode>(translation: Record<"en" | "ko" | (string & {}), Returns>): Returns extends string ? string : Returns;
        };
        lang: string;
    };
};

export declare const mergePageConfigs: (configChain?: PageConfig[]) => PageConfig;

export declare const msg: RuntimeMsg;

export declare const nativePlatform: () => "android" | "ios" | null;

export declare const navigateRsc: (href: string, options?: {
    replace?: boolean;
    scrollToTop?: boolean;
    shallow?: boolean;
}) => Promise<void> | undefined;

export declare const normalizeDeepLinkHref: (href: string, origin?: string) => string;

export declare const openExternalUrl: (url: string) => Promise<void>;

export declare const page: () => PageDefinition<Record<never, never>, Record<never, never>>;

export declare const pageActivityContext: import("react").Context<PageActivityState>;

export declare const pathContext: import("react").Context<PathContextType>;

export declare const prefetchRsc: (href: string, priority?: PrefetchPriority) => void;

export declare const radiusTokens: string[];

export declare const readCssSafeAreaInsets: () => SafeAreaInsets;

export declare const refreshRsc: () => Promise<void> | undefined;

export declare const registerClientRuntime: <Runtime>(runtime: Runtime, { scope }?: {
    scope?: RuntimeScope;
}) => Runtime;

export declare const removeCookie: (key: string, options?: {
    path: string;
}) => void;

export declare const resetAuth: () => void;

export declare const resolvePageState: ({ configChain, path, basePath, platform, deviceSafeArea, cssSafeArea, width, }: ResolvePageStateOptions) => PageState;

export declare const resolveRouteModule: (mod: RouteModuleSource, key: string, { kind, pattern }?: ResolveRouteModuleOption) => ResolvedRouteModule;

export declare const resolveServerUrl: (url: string) => string;

export declare const rootLayout: () => RootLayoutDefinition<Record<never, never>>;

export declare const routeArgsMarker: unique symbol;

export declare const routeDefinitionMarker: unique symbol;

export declare const router: Router;

export declare const secretStorage: {
    getItem: (key: string) => Promise<null | string | undefined>;
    setItem: (key: string, value: string) => Promise<undefined | void>;
    removeItem: (key: string) => Promise<undefined | void>;
};

export declare const setAuth: ({ jwt }: SetAuthOption) => void;

export declare const setCookie: (key: string, value: string, { path, sameSite, secure }?: CookieOptions) => void;

export declare const sharedContext: <T>(name: string, initial: T) => Context<T>;

export declare const sig: Record<PropertyKey, unknown>;

export declare const storage: {
    getItem: (key: string) => Promise<null | string | undefined>;
    setItem: (key: string, value: string) => Promise<undefined | void>;
    removeItem: (key: string) => Promise<undefined | void>;
};

export declare const toManifestJson: (value: unknown) => unknown;

export declare const transitionTypes: readonly [
    "none",
    "fade",
    "bottomUp",
    "stack",
    "scaleOut"
];

export declare const useCsr: () => CsrContextType;

export declare const usePage: ClientRuntime["usePage"];

export declare const usePathCtx: () => PathContextType;

export declare const useRscNavigation: () => {
    clearCache: () => void;
    isFromCache: () => boolean;
    navigate: (href: string, options?: {
        replace?: boolean;
        scrollToTop?: boolean;
        shallow?: boolean;
    }) => Promise<void> | undefined;
};

export declare const validatePageConfig: (routeKey: string, config?: PageConfig) => void;

export declare const webManifestHref: (basePath?: null | string) => string;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface CSRClientRouterOption extends RouterOptions {
    type: "csr";
    router: RouterInstance;
}

interface CookieOptions {
    path?: string;
    sameSite?: "lax" | "none" | "strict";
    secure?: boolean;
}

type DebugPayload = Record<string, unknown>;

interface DeviceInitOption {
    lang: string;
    info: DeviceInfo;
    topSafeArea: number;
    bottomSafeArea: number;
    native: NativeControls | null;
}

interface ErrPayload extends ErrRestoreOption {
    error: string;
    data?: Record<string, unknown>;
}

interface ErrRestoreOption {
    statusCode?: number;
    code?: string;
    details?: unknown;
    path?: string;
    timestamp?: string;
}

type FreeName<Name extends string, Taken> = Name extends "lang" | keyof Taken ? never : Name;

type HeadStage<Args> = ((args: Args) => PromiseOrObject<Head | null | undefined>) | Head;

interface InitAuthOption {
    jwt?: string;
}

type NativeControls = Pick<NativeModule, "haptics" | "keyboard">;

type NativeModule = typeof import("./native");

type PageErrConstructor<ErrorKey extends string> = (new (key: ErrorKey, data?: Record<string, unknown>, option?: ErrRestoreOption) => PageErrInstance) & {
    prototype: PageErrInstance;
    fromJSON(payload: ErrPayload): PageErrInstance;
    is<Key extends ErrorKey>(error: unknown, ...keys: Key[]): error is PageErrInstance & {
        readonly error: Key;
    };
    BadRequest: PageErrConstructor<ErrorKey>;
    Unauthorized: PageErrConstructor<ErrorKey>;
    Forbidden: PageErrConstructor<ErrorKey>;
    NotFound: PageErrConstructor<ErrorKey>;
    Conflict: PageErrConstructor<ErrorKey>;
};

type PageErrInstance = Error & {
    readonly error: string;
    readonly statusCode: number;
    readonly code?: string;
    readonly details?: unknown;
    readonly data?: Record<string, unknown>;
    readonly path?: string;
    readonly timestamp?: string;
    toJSON(): ErrPayload & {
        statusCode: number;
    };
};

declare class Router {
    isInitialized: boolean;
    init(options: CSRClientRouterOption | SsrClientRouterOption | SsrServerRouterOption): void;
    setFrameParentOrigins(origins: "*" | string[]): void;
    postPathChange(change: {
        page: number;
    } | {
        path: string;
        pathname: string;
        hash: string;
    }): void;
    resolveDeepLinkStack(href: string): string[];
    enterDeepLink(href: string, options?: DeepLinkOptions): boolean;
    push(href: string, routeOptions?: RouteOptions): never;
    replace(href: string, routeOptions?: RouteOptions): never;
    prefetch(href: string, { priority }?: {
        priority?: PrefetchPriority;
    }): void;
    addNavigationGuard(guard: NavigationGuard): () => void;
    navigation(): Promise<void>;
    canGoBack(): boolean;
    backOrFallback(fallbackHref?: string, routeOptions?: RouteOptions): never;
    back(routeOptions?: RouteOptions): never;
    refresh(): never;
    redirectCount(): number;
    navigationCount(): number;
    redirect(target: string, options?: RedirectOptions): never;
    notFound(): never;
    setLang(lang: string): never;
    routeOf(pathname: string): string;
    getPath(pathname?: string): string;
    getFullPath(withLang?: boolean): string;
    getPrefix(): string;
    getPrefixedPath(path: string): string;
}

interface RouterOptions {
    prefix?: string;
    lang?: string;
    routeManifest?: RouteManifest | string[];
    indexPath?: string;
}

type RuntimeErr = {
    new (key: string, data?: Record<string, unknown>, option?: Record<string, unknown>): Error;
    BadRequest?: RuntimeErr;
    Conflict?: RuntimeErr;
    Forbidden?: RuntimeErr;
    NotFound?: RuntimeErr;
    Unauthorized?: RuntimeErr;
    fromJSON?: (payload: Record<string, unknown>) => Error;
    [key: string]: unknown;
};

type RuntimeFetch = typeof globalThis.fetch & {
    instance: unknown;
    origin: string;
    serializedSignal: Record<string, unknown>;
    setJwt: (jwt: null | string) => void;
    slice: Record<string, SliceMeta>;
    sortKeyMap?: Map<string, string[]>;
    filterQueryMap?: Map<string, {
        [queryKey: string]: SerializedArg[];
    }>;
    ws: RuntimeWs;
    [key: string]: unknown;
};

type RuntimeMsg = {
    info: (key: string, option?: TransMessageOption) => void;
    success: (key: string, option?: TransMessageOption) => void;
    error: (key: string, option?: TransMessageOption) => void;
    warning: (key: string, option?: TransMessageOption) => void;
    loading: (key: string, option?: TransMessageOption) => void;
};

type RuntimePage = {
    path: string;
    l: RuntimeTranslate;
    lang: string;
};

type RuntimeScope = "app" | "lib";

type RuntimeTranslate = ((key: string, param?: Record<string, number | string>) => string) & {
    _: (key: string, param?: Record<string, number | string>) => string;
    rich: (key: string, param?: Record<string, number | string>) => ReactNode;
    trans: <Returns extends ReactNode>(translation: Record<"en" | "ko" | (string & {}), Returns>) => Returns extends string ? string : Returns;
};

type RuntimeWs = {
    connected: boolean;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
};

interface SetAuthOption {
    jwt: string;
}

interface SsrClientRouterOption extends RouterOptions {
    type: "ssr";
    side: "client";
    router: RouterInstance;
}

interface SsrServerRouterOption extends RouterOptions {
    type: "ssr";
    side: "server";
}

type TagProps = Record<string, unknown>;

interface ToastProps {
    root?: string;
    duration?: number;
}
```
