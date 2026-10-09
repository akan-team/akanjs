"use client";
import type { ReactDOMAttributes } from "@use-gesture/react/dist/declarations/src/types";
import type { PromiseOrObject } from "akanjs/base";
import { type ForwardRefExoticComponent, type ReactNode, type RefObject, useContext } from "react";
import type { AnimatedComponent, AnimatedProps, Interpolation, SpringValue } from "react-spring";
import type { RouteDefinition } from "./route/RouteDefinition";
import type { RouterInstance } from "./router";
import { sharedContext } from "./sharedContext";
import type { ReactFont } from "./types";

export type TransitionType = "none" | "fade" | "bottomUp" | "stack" | "scaleOut";
export type PageSafeAreaConfig =
  | boolean
  | "top"
  | "bottom"
  | {
      top?: boolean;
      bottom?: boolean;
      android?: "auto" | "edge-to-edge" | "none";
    };
/** `"stream"` flushes the shell (`Loading` included) then streams; a redirect in suspended content becomes a client one.
 * `"block"` buffers the whole document, so an error in slow content can still render a clean error page. */
export type SsrRenderMode = "stream" | "block";

export interface PageConfig {
  transition?: TransitionType;
  safeArea?: PageSafeAreaConfig;
  /** Top chrome reservation in px. Use true for the default 48px reservation. */
  topInset?: number | boolean;
  /** Bottom chrome reservation in px. Use true for the default 48px reservation. */
  bottomInset?: number | boolean;
  gesture?: boolean;
  cache?: boolean;
  /** Initial full-document SSR strategy. Defaults to `"stream"`. */
  ssr?: SsrRenderMode;
  /** Opt-in suffix-only RSC commits, for a page needing no head update under a layout head its siblings share. */
  rscPatchHeadSafe?: boolean;
  topSafeAreaColor?: string;
  bottomSafeAreaColor?: string;
  /** Keeps the route (on a `_layout`, its whole directory) out of `akan build` while `akan start` serves it. Write a
   * literal `true`/`false`: the build reads it off the source without evaluating the module. */
  devOnly?: boolean;
}

export interface CsrState {
  transition: TransitionType;
  topSafeArea: number;
  bottomSafeArea: number;
  topInset: number;
  bottomInset: number;
  gesture: boolean;
  cache: boolean;
  ssr: SsrRenderMode;
  topSafeAreaColor?: string;
  bottomSafeAreaColor?: string;
}
export const DEFAULT_TOP_INSET = 48;
export const DEFAULT_BOTTOM_INSET = 60;
export interface PageProps {
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] };
}
export interface LayoutProps extends PageProps {
  children: ReactNode;
}
export interface PageLoadingProps {
  params: { [key: string]: string };
}
export interface LayoutLoadingProps extends PageLoadingProps {
  children: ReactNode;
}
export interface LayoutNotFoundProps extends PageProps {
  pathname: string;
}
export interface LayoutErrorProps extends LayoutNotFoundProps {
  error?: unknown;
  digest?: string;
}
export type Head = ReactNode;
export type GenerateHead = (props: PageProps) => PromiseOrObject<Head | null | undefined>;
export interface AkanHeadSnapshotNode {
  tag: "title" | "meta" | "link";
  attrs?: Record<string, string>;
  text?: string;
}
export interface AkanHeadSnapshotV1 {
  version: 1;
  nodes: AkanHeadSnapshotNode[];
}
export interface ResolvedHead {
  node: Head | null | undefined;
  headSnapshot?: AkanHeadSnapshotV1;
}
export type ResolveHeadResult = Head | ResolvedHead | null | undefined;
export type ResolveHead = (props: PageProps) => PromiseOrObject<ResolveHeadResult>;
export type HeadProps = PageProps;
export type PageRender = (props: PageProps) => PromiseOrObject<ReactNode>;
export type LayoutRender = (props: LayoutProps) => PromiseOrObject<ReactNode>;
export type PageLoadingRender = (props: PageLoadingProps) => PromiseOrObject<ReactNode>;
export type LayoutLoadingRender = (props: LayoutLoadingProps) => PromiseOrObject<ReactNode>;
export type LayoutNotFoundRender = (props: LayoutNotFoundProps) => PromiseOrObject<ReactNode>;
export type LayoutErrorRender = (props: LayoutErrorProps) => PromiseOrObject<ReactNode>;
export interface RouteRender {
  render: LayoutRender | PageRender;
  isAsync?: boolean;
  /** CSR: a page's render reads the query; a layout's reads only the params of its own path (`paramNames`). */
  kind?: "page" | "layout";
  paramNames?: string[];
  Loading?: LayoutLoadingRender | PageLoadingRender;
  /** Loads the module and fills `Loading` without running `render`/`resolveHead` (the suffix compose path). */
  resolveLoading?: () => void | Promise<void>;
  NotFound?: LayoutNotFoundRender;
  Error?: LayoutErrorRender;
  resolveNotFound?: () => PromiseOrObject<LayoutNotFoundRender | undefined>;
  resolveError?: () => PromiseOrObject<LayoutErrorRender | undefined>;
  resolveHead?: ResolveHead;
  /** Parses the declared args without rendering, so a path value the type refuses answers not-found before any byte. */
  checkArgs?: (props: PageProps) => Promise<void>;
  getPageConfig?: () => PromiseOrObject<PageConfig | undefined>;
  getLayoutPageConfig?: () => PromiseOrObject<PageConfig | undefined>;
  /** A root layout's `theme`, readable before it renders. */
  getLayoutTheme?: () => PromiseOrObject<string | undefined>;
  /** The `page()` chain behind a page render, when it was declared as one — what a page prompt is read off. */
  getRouteDefinition?: () => PromiseOrObject<RouteDefinition | undefined>;
}
export interface WebAppManifestIcon {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
  [key: string]: unknown;
}
export interface WebAppManifest {
  name?: string;
  shortName?: string;
  startUrl?: string;
  scope?: string;
  display?: "fullscreen" | "standalone" | "minimal-ui" | "browser" | (string & {});
  displayOverride?: string[];
  orientation?: string;
  themeColor?: string;
  backgroundColor?: string;
  description?: string;
  lang?: string;
  dir?: "ltr" | "rtl" | "auto";
  icons?: WebAppManifestIcon[];
  categories?: string[];
  screenshots?: WebAppManifestIcon[];
  [key: string]: unknown;
}
export interface PageModule {
  default?: PageRender;
  pageConfig?: PageConfig;
  head?: Head;
  generateHead?: GenerateHead;
  Loading?: PageLoadingRender;
}
export interface LayoutModule {
  default?: LayoutRender;
  pageConfig?: PageConfig;
  head?: Head;
  generateHead?: GenerateHead;
  fonts?: ReactFont[];
  manifest?: WebAppManifest;
  theme?: string;
  reconnect?: boolean;
  wsConnect?: boolean;
  layoutStyle?: "mobile" | "web";
  Loading?: LayoutLoadingRender;
  NotFound?: LayoutNotFoundRender;
  Error?: LayoutErrorRender;
}
export type RouteModule = PageModule | LayoutModule;
export interface Route {
  PageConfig?: PageConfig;
  pageConfig?: PageConfig;
  layoutPageConfig?: PageConfig;
  path: string;
  renderPage?: RouteRender;
  renderLayout?: RouteRender;
  /** `renderLayout` is a generated `__root_layout`: a root boundary the page generator found. */
  isRootLayout?: boolean;
  /** Synthetic layout render from a `_overrides.tsx` at this node; wraps the subtree in a UI-override provider. */
  renderOverrides?: RouteRender;
  pageIncludesOwnLayout?: boolean;
  loader?: () => unknown;
  pageState?: PageState;
  pageConfigChain?: PageConfig[];
  explicitPageConfigKeys?: Partial<Record<keyof PageConfig, boolean>>;
  children: Map<string, Route>;
}

export type AnimatedDivProps =
  AnimatedComponent<"div"> extends ForwardRefExoticComponent<AnimatedProps<infer P>> ? P : never;
export type TransitionStyle = AnimatedDivProps["style"];

export interface SafeAreaTransition {
  containerStyle: TransitionStyle;
}
export interface ContainerTransition {
  containerStyle: TransitionStyle;
  contentStyle: TransitionStyle;
  prevContentStyle: TransitionStyle;
}
export interface PageTransition {
  containerStyle: TransitionStyle;
  contentStyle: TransitionStyle;
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

export type PageState = CsrState & {
  topInset: number;
  bottomInset: number;
};

export interface Location {
  href: string;
  pathname: string;
  search: string;
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] };
  pathRoute: PathRoute;
  hash: string;
  entryId?: string; // the history entry this location is; a replace within one route keeps it
}
export type CsrNavigationPhase = "idle" | "preparing" | "transitioning";
export type CsrNavigationKind = "push" | "replace" | "back" | "popForward" | "popBack";
export interface NavigationIntent {
  id: number;
  kind: CsrNavigationKind;
  from: Location;
  to: Location;
  scrollTop: number;
  scrollToTop?: boolean;
  createdAt: number;
}
export interface LocationState {
  location: Location;
  prevLocation: Location | null;
  pendingLocation?: Location | null;
  navigationIntent?: NavigationIntent | null;
  phase: CsrNavigationPhase;
}
export interface History {
  type: "initial" | "forward" | "back";
  locations: Location[];
  scrollMap: Map<string, number>;
  idxMap: Map<string, number>;
  cachedLocationMap: Map<string, Location>;
  idx: number;
  dormant?: Set<string>; // entry ids a restored stack holds without a page until one is visited
}

export interface RouterProps {
  push: (path: string) => void;
  replace: (path: string) => void;
  refresh: () => void;
  back: () => void | Promise<void>;
}

export type CsrPageType = "current" | "prev" | "pending" | "cached";
export interface CsrStackEntry {
  key: string; // the page container's identity: the entry, or the route itself for a `cache` page
  location: Location;
  pageType: CsrPageType;
  zIndex: number;
}

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
  onBack: RefObject<{ [K in TransitionType]?: () => Promise<void> }>;
  router: RouterInstance;
  pathRoutes: PathRoute[];
  registerFrameSlot: (path: string, slot: FrameSlotRegistration, bucket?: FrameSlotBucket) => () => void;
  frameLayout: FrameLayoutState;
}

export type UseCsrTransition = CsrTransitionStyles & {
  pageBind: (...args: unknown[]) => ReactDOMAttributes;
  pageClassName: string;
  transDirection: "vertical" | "horizontal" | "none";
  transUnitRange: number[];
  transUnit: SpringValue<number>;
  transPercent: Interpolation<number>;
  transProgress: Interpolation<number>;
};

export type CsrContextType = RouteState & UseCsrTransition;
// The web's SSR tree has no CSR shell, so no provider: its refs still exist, empty, as a mounted page's are before commit.
export const csrContext = sharedContext<CsrContextType>("csr", {
  history: { current: null },
  topSafeAreaRef: { current: null },
  bottomSafeAreaRef: { current: null },
  prevPageContentRef: { current: null },
  pageContentRef: { current: null },
  frameRootRef: { current: null },
  onBack: { current: {} },
} as unknown as CsrContextType);
export const useCsr = () => {
  const contextValues = useContext(csrContext);
  return contextValues;
};

export interface PathContextType {
  pageType: CsrPageType;
  pageKey?: string;
  location: Location;
  prefix?: string;
  gestureEnabled: boolean;
  setGestureEnabled: (enabled: boolean) => void;
  registerFrameSlot: (slot: FrameSlotRegistration) => () => void;
}
export const pathContext = sharedContext<PathContextType>("path", {} as unknown as PathContextType);
export const usePathCtx = () => {
  const contextValues = useContext(pathContext);
  return contextValues;
};

//? `prev` is shown under the current page for a swipe back; `hidden` is parked, its effects stopped.
export type PageActivity = "current" | "prev" | "pending" | "hidden";
export interface PageActivityState {
  activity: PageActivity;
  focused: boolean;
}
export const pageActivityContext = sharedContext<PageActivityState>("pageActivity", {
  activity: "current",
  focused: true,
});

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

export type FrameSlotScope = "page" | "layout";
export type FrameSlotType = "topInset" | "bottomInset";
export type FrameSlotBucket = "active" | "pending";
export type FrameLayer = "page" | "topChrome" | "bottomChrome" | "keyboard" | "overlay";
export type FrameSlotRole = "topChrome" | "bottomChrome" | "keyboardAccessory";
export type FramePlatformProfile = "ios" | "android" | "web" | "mobileWeb";
export interface FrameViewportState {
  width: number;
  height: number;
  visualWidth: number;
  visualHeight: number;
  visualOffsetTop: number;
}
export interface KeyboardFrameState {
  height: number;
  offset: number;
  visible: boolean;
  sticky: boolean;
  frozen?: boolean;
  source?: "native" | "visualViewport" | "fallback";
  animationDuration?: number;
  animationEasing?: string;
}
export interface FrameContentViewportState {
  top: number;
  bottom: number;
  height: number;
}
export interface KeyboardAccessoryFrameState {
  top: number;
  bottom: number;
  height: number;
  visible: boolean;
  slotHeight: number;
}
export interface FrameSnapshot {
  location: Location;
  pageState: PageState;
  viewport: FrameViewportState;
  frameSlots: FrameSlotRegistration[];
  measuredAt: number;
}
export interface TransitionActionContext {
  plan: TransitionPlan;
}
export interface TransitionAction {
  type: "page" | "topChrome" | "bottomChrome" | "keyboard" | "safeArea" | (string & {});
  run: (ctx: TransitionActionContext) => Promise<void> | void;
}
export interface TransitionPlan {
  id: number;
  intent: NavigationIntent;
  type: TransitionType;
  direction: "forward" | "back";
  fromFrame: FrameSnapshot;
  toFrame: FrameSnapshot;
  actions: TransitionAction[];
  duration: number;
}
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
export interface FrameSlotRegistration {
  scope?: FrameSlotScope;
  type: FrameSlotType;
  role?: FrameSlotRole;
  contentAnchor?: "bottom";
  height?: number;
  estimatedHeight?: number;
  source?: "navbar" | "topInset" | "bottomInset" | "bottomTab" | (string & {});
  cache?: boolean;
}

export interface LayoutFallbackRoute {
  path: string;
  pathSegments: string[];
  renderRootLayouts: RouteRender[];
  renderLayouts: RouteRender[];
}

export interface RouteGuide {
  pathSegment: string;
  pathRoute?: PathRoute;
  children: { [key: string]: RouteGuide };
}
