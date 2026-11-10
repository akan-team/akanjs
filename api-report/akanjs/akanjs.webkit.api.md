# `akanjs/webkit`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export type LoginAuth = "admin" | "public" | "user";

export interface LoginForm {
    auth: LoginAuth;
    redirect?: string;
    unauthorize?: string;
    jwt?: null | string;
}

export declare class McpAppBoot {
    static run({ app, page, root, rootOverrides, overrides, basePath }: McpAppBootProps): Promise<void>;
}

export interface McpAppBootProps {
    app: string;
    page: RouteModuleSource;
    root: {
        McpAppRoot?: (props: McpAppRootProps) => ReactNode;
    };
    rootOverrides?: McpAppOverride[];
    overrides?: McpAppOverride[];
    basePath?: string;
}

export interface McpAppRootProps {
    params: {
        lang: string;
    };
    path: string;
    children: ReactNode;
}

export interface ScreenScopeItem {
    id: string;
    label?: string;
}

export interface VisualViewportFrame {
    keyboardHeight: number;
    height: number;
    offsetTop: number;
}

export declare const bootCsr: (context: CsrRouteContext) => Promise<void>;

export declare const createRobotPage: (clientHttpUri: string, config?: {
    rules: {
        userAgent: string;
        allow: string;
        disallow: string;
    };
    sitemap: string;
}) => {
    rules: {
        userAgent: string;
        allow: string;
        disallow: string;
    };
    sitemap: string;
};

export declare const createSitemapPage: (clientHttpUri: string, paths: string[]) => {
    url: string;
    lastModified: Date;
}[];

export declare const lazy: <Loaded>(loader: () => Promise<Loaded>, option?: LazyOption) => LoadedOf<Loaded>;

export declare const replacePages: (context: CsrRouteContext) => Promise<boolean>;

export declare const useBodyScrollLock: (active: boolean) => void;

export declare const useCamera: ({ promptLabels }?: {
    promptLabels?: CameraPromptLabels;
}) => {
    permissions: {
        camera: PermissionState;
    };
    getPhoto: (src?: "camera" | "photos" | "prompt") => Promise<undefined | {
        dataUrl: string;
    }>;
    pickImage: ({ limit }?: {
        limit?: number;
    }) => Promise<undefined | {
        dataUrl: string;
    }[]>;
    checkPermission: () => Promise<"denied" | "granted" | "prompt">;
};

export declare const useCsrValues: (rootRouteGuide: RouteGuide, pathRoutes: PathRoute[]) => {
    page: PageTransition | null;
    topSafeArea: import("akanjs/client").SafeAreaTransition | null;
    prevPage: PageTransition | null;
    topInset: import("akanjs/client").ContainerTransition | null;
    bottomInset: import("akanjs/client").ContainerTransition | null;
    topLeftAction: import("akanjs/client").ContainerTransition | null;
    bottomSafeArea: import("akanjs/client").SafeAreaTransition | null;
    pageBind: (...args: unknown[]) => import("@use-gesture/react/dist/declarations/src/types").ReactDOMAttributes;
    pageClassName: string;
    transDirection: "horizontal" | "none" | "vertical";
    transUnitRange: number[];
    transUnit: import("@react-spring/web").SpringValue<number>;
    transPercent: import("@react-spring/web").Interpolation<number>;
    transProgress: import("@react-spring/web").Interpolation<number>;
    clientWidth: number;
    clientHeight: number;
    location: Location;
    prevLocation: Location | null;
    pendingLocation: Location | null;
    stackEntries: import("akanjs/client").CsrStackEntry[];
    navigationIntent: NavigationIntent | null;
    phase: import("akanjs/client").CsrNavigationPhase;
    isBackgrounded: boolean;
    history: import("react").RefObject<import("akanjs/client").History>;
    topSafeAreaRef: import("react").RefObject<HTMLDivElement | null>;
    bottomSafeAreaRef: import("react").RefObject<HTMLDivElement | null>;
    prevPageContentRef: import("react").RefObject<HTMLDivElement | null>;
    pageContentRef: import("react").RefObject<HTMLDivElement | null>;
    frameRootRef: import("react").RefObject<HTMLDivElement | null>;
    onBack: import("react").RefObject<{
        [K in TransitionType]?: () => Promise<void>;
    }>;
    router: RouterInstance;
    pathRoutes: PathRoute[];
    registerFrameSlot: (path: string, slot: import("akanjs/client").FrameSlotRegistration, bucket?: import("akanjs/client").FrameSlotBucket) => () => void;
    frameLayout: import("akanjs/client").FrameLayoutState;
};

export declare const useDebounce: <Args extends unknown[], Return>(callback: (...args: Args) => Return, _states?: unknown[], wait?: number) => (...args: Args) => void;

export declare const useEscapeKey: (active: boolean, onEscape: () => void) => void;

export declare const useFetch: <Return>(fnOrPromise: Promise<Return> | Return, { onError, keepPrevious, }?: {
    onError?: (err: string) => void;
    keepPrevious?: boolean;
}) => {
    fulfilled: boolean;
    value: Return | null;
};

export declare const useFetchFn: <Return>(factory: () => Promise<Return> | Return, deps?: unknown[], options?: {
    onError?: (err: string) => void;
}) => {
    fulfilled: boolean;
    value: Return | null;
};

export declare const useGeoLocation: () => {
    checkPermission: () => Promise<import("@akanjs/native/plugins/geolocation").LocationPermission>;
    getPosition: (options?: {
        enableHighAccuracy?: boolean;
    }) => Promise<import("akanjs/client/native").Position | undefined>;
};

export declare const useHistory: (locations?: Location[], { idx, dormant }?: {
    idx?: number;
    dormant?: Set<string>;
}) => {
    history: import("react").RefObject<History>;
    setHistoryForward: ({ type, location, scrollTop, scrollToTop }: setForwardOptions) => void;
    setHistoryBack: ({ location, scrollTop, scrollToTop }: setBackOptions) => void;
    setHistoryJump: (idx: number, scrollTop?: number) => void;
    getNextLocation: () => Location | null;
    getCurrentLocation: () => Location;
    getPrevLocation: () => Location | null;
    getScrollTop: (location: Location) => number;
};

export declare const useInterval: (callback: (() => Promise<void>) | (() => void), delay: number) => import("react").RefObject<(() => Promise<void>) | (() => void) | null>;

export declare const useLocation: ({ rootRouteGuide }: UseLocationOptions) => {
    getLocation: (href: string) => Location;
};

export declare const useNavigationGuard: (guard: NavigationGuard) => void;

export declare const usePageActivity: () => import("akanjs/client").PageActivity;

export declare const usePageFocusEffect: (effect: EffectCallback, deps: DependencyList) => void;

export declare const usePageLocation: () => {
    pathname: string;
    params: {
        [key: string]: string;
    };
    searchParams: import("akanjs/store").BaseSearchParamsState;
};

export declare const usePageTool: ({ name, model, page, lastPage, total, onSelect }: PageToolOptions) => (args_0: number) => Promise<void>;

export declare const useScreenScope: ({ id, kind, label, items }: ScreenScopeOptions) => string;

export declare const useThrottle: <Args extends unknown[], Return>(func: (...args: Args) => Return, delay?: number, deps?: unknown[]) => (...args: Args) => void;

export declare const useVisualViewportFrame: () => VisualViewportFrame;
```

## Referenced, not exported

The declarations above name these, and no entry point exports them.

```ts
interface CameraPromptLabels {
    header?: string;
    photo?: string;
    picture?: string;
    cancel?: string;
}

type CsrRouteContext = Record<string, CsrRouteModuleEntry>;

type CsrRouteModuleEntry = CsrRouteModuleLoader | {
    loader: CsrRouteModuleLoader;
    isAsyncDefault?: boolean;
};

type CsrRouteModuleLoader = () => Promise<RouteModuleSource>;

type LazyOption = {
    ssr?: boolean;
    suspense?: boolean;
    loading?: () => ReactNode;
};

type LoadedOf<Loaded> = Loaded extends {
    default: infer T;
} ? T : Loaded;

interface LocationPermission {
    location: PermissionState;
    precise: boolean | null;
}

type McpAppOverride = (props: {
    children?: ReactNode;
}) => ReactNode;

interface PageToolOptions {
    name: null | string;
    model: string;
    page: number;
    lastPage: number;
    total: number;
    onSelect: (page: number) => void;
}

// ../@akanjs/native/plugins/geolocation/src/index
type PermissionState = "denied" | "granted" | "prompt" | "prompt-with-rationale";

// webkit/useCamera
type PermissionState = "denied" | "granted" | "prompt";

interface ScreenScopeOptions {
    id: string;
    kind: string;
    label?: string;
    items?: () => ScreenScopeItem[];
}

interface UseLocationOptions {
    rootRouteGuide: RouteGuide;
}

interface setBackOptions {
    type: "back" | "popBack";
    location: Location;
    scrollTop?: number;
    scrollToTop?: boolean;
}

interface setForwardOptions {
    type: "popForward" | "push" | "replace";
    location: Location;
    scrollTop?: number;
    scrollToTop?: boolean;
}
```
