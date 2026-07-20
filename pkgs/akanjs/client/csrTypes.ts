"use client";
import type { ReactDOMAttributes } from "@use-gesture/react/dist/declarations/src/types";
import type { PromiseOrObject } from "akanjs/base";
import { createContext, type ForwardRefExoticComponent, type ReactNode, type RefObject, useContext } from "react";
import type { AnimatedComponent, AnimatedProps, Interpolation, SpringValue } from "react-spring";
import type { RouterInstance } from "./router";
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
/** Per-page CSR configuration for transition, safe-area, and gesture behavior. */
export interface PageConfig {
  transition?: TransitionType;
  safeArea?: PageSafeAreaConfig;
  /** Top chrome reservation in px. Use true for the default 48px reservation. */
  topInset?: number | boolean;
  /** Bottom chrome reservation in px. Use true for the default 48px reservation. */
  bottomInset?: number | boolean;
  gesture?: boolean;
  cache?: boolean;
  /**
   * Opt in to guarded RSC page suffix commits when the page does not require
   * head/metadata updates and the retained route chain head is invariant for
   * sibling navigations under the same layout.
   */
  rscPatchHeadSafe?: boolean;
  topSafeAreaColor?: string;
  bottomSafeAreaColor?: string;
}

export interface CsrState {
  transition: TransitionType;
  topSafeArea: number;
  bottomSafeArea: number;
  topInset: number;
  bottomInset: number;
  gesture: boolean;
  cache: boolean;
  topSafeAreaColor?: string;
  bottomSafeAreaColor?: string;
}
export const DEFAULT_TOP_INSET = 48;
export const DEFAULT_BOTTOM_INSET = 60;
export interface PageProps {
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] };
}
/** Props passed to Akan layout route modules. */
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
  hasExplicitLanguageAlternates: boolean;
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
  Loading?: LayoutLoadingRender | PageLoadingRender;
  NotFound?: LayoutNotFoundRender;
  Error?: LayoutErrorRender;
  resolveNotFound?: () => PromiseOrObject<LayoutNotFoundRender | undefined>;
  resolveError?: () => PromiseOrObject<LayoutErrorRender | undefined>;
  resolveHead?: ResolveHead;
  getPageConfig?: () => PromiseOrObject<PageConfig | undefined>;
  getLayoutPageConfig?: () => PromiseOrObject<PageConfig | undefined>;
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
export interface AkanMetadata {
  title?: string;
  description?: string;
  robots?: string;
  openGraph?: {
    title?: string;
    description?: string;
    type?: string;
    url?: string;
    siteName?: string;
    images?: string | string[];
  };
  twitter?: {
    card?: "summary" | "summary_large_image" | "app" | "player" | (string & {});
    title?: string;
    description?: string;
    images?: string | string[];
  };
  alternates?: {
    canonical?: string;
    languages?: Record<string, string>;
  };
}
export type GenerateMetadata = (props: PageProps) => PromiseOrObject<AkanMetadata | null | undefined>;
export interface PageModule {
  default?: PageRender;
  pageConfig?: PageConfig;
  head?: Head;
  metadata?: AkanMetadata;
  generateHead?: GenerateHead;
  generateMetadata?: GenerateMetadata;
  Loading?: PageLoadingRender;
}
export interface LayoutModule {
  default?: LayoutRender;
  pageConfig?: PageConfig;
  head?: Head;
  metadata?: AkanMetadata;
  generateHead?: GenerateHead;
  generateMetadata?: GenerateMetadata;
  fonts?: ReactFont[];
  manifest?: WebAppManifest;
  theme?: string;
  reconnect?: boolean;
  wsConnect?: boolean;
  layoutStyle?: "mobile" | "web";
  gaTrackingId?: string;
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
  /** Synthetic layout render from a `_overrides.tsx` at this node; wraps the subtree in a UI-override provider. */
  renderOverrides?: RouteRender;
  pageIncludesOwnLayout?: boolean;
  isSpecialRoute?: boolean;
  // Page?:
  //   | (({ params, searchParams }: PageProps) => ReactNode)
  //   | (({ params, searchParams }: PageProps) => Promise<ReactNode>);
  // Layout?:
  //   | (({ children, params, searchParams }: LayoutProps) => ReactNode)
  //   | (({ children, params, searchParams }: LayoutProps) => Promise<ReactNode>);
  loader?: () => unknown;
  pageState?: PageState;
  pageConfigChain?: PageConfig[];
  explicitPageConfigKeys?: Partial<Record<keyof PageConfig, boolean>>;
  // action?: any;
  // ErrorBoundary?: any;
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
export const defaultPageState: PageState = {
  transition: "none",
  topSafeArea: 0,
  bottomSafeArea: 0,
  topInset: 0,
  bottomInset: 0,
  gesture: true,
  cache: false,
  topSafeAreaColor: "var(--color-base-100, Canvas)",
  bottomSafeAreaColor: "var(--color-base-100, Canvas)",
};

export interface Location {
  href: string;
  pathname: string;
  search: string;
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] };
  pathRoute: PathRoute;
  hash: string;
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
}

export interface RouterProps {
  push: (path: string) => void;
  replace: (path: string) => void;
  refresh: () => void;
  back: () => void | Promise<void>;
}

export interface RouteState {
  clientWidth: number;
  clientHeight: number;
  location: Location;
  prevLocation: Location | null;
  pendingLocation: Location | null;
  navigationIntent: NavigationIntent | null;
  phase: CsrNavigationPhase;
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
export const csrContext = createContext<CsrContextType>({} as unknown as CsrContextType);
export const useCsr = () => {
  const contextValues = useContext(csrContext);
  return contextValues;
};

export interface PathContextType {
  pageType: "current" | "prev" | "cached" | "pending";
  location: Location;
  prefix?: string;
  gestureEnabled: boolean;
  setGestureEnabled: (enabled: boolean) => void;
  registerFrameSlot: (slot: FrameSlotRegistration) => () => void;
}
export const pathContext = createContext<PathContextType>({} as unknown as PathContextType);
export const usePathCtx = () => {
  const contextValues = useContext(pathContext);
  return contextValues;
};

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
  isSpecialRoute?: boolean;
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
  platformProfile: FramePlatformProfile;
  zIndex: FrameLayerZIndex;
  pageStateByPath: Map<string, PageState>;
}
export interface FrameSlotRegistration {
  scope?: FrameSlotScope;
  type: FrameSlotType;
  role?: FrameSlotRole;
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
