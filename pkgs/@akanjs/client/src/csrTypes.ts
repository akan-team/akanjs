"use client";
import type { ReactDOMAttributes } from "@use-gesture/react/dist/declarations/src/types";
import { createContext, type ForwardRefExoticComponent, ReactNode, RefObject, useContext } from "react";
import type { AnimatedComponent, AnimatedProps, Interpolation, SpringValue } from "react-spring";

import type { RouterInstance } from "./router";

export type TransitionType = "none" | "fade" | "bottomUp" | "stack" | "scaleOut";
export interface CsrConfig {
  transition?: TransitionType;
  safeArea?: boolean | "top" | "bottom";
  topInset?: boolean | number;
  /**
   * @default 48px
   */
  bottomInset?: boolean | number;
  gesture?: boolean;
  cache?: boolean;
  /**
   * @default "transparent"
   * @description The color of the top safe area
   * @example "red"
   * @example "rgba(255, 255, 255, 0.5)"
   * @example "transparent"
   * @example "none"
   * @example "inherit"
   * @example "initial"
   * @example "unset"
   */
  topSafeAreaColor?: string;
  /**
   * @default "transparent"
   * @description The color of the top safe area
   * @example "red"
   * @example "rgba(255, 255, 255, 0.5)"
   * @example "transparent"
   * @example "none"
   * @example "inherit"
   * @example "initial"
   * @example "unset"
   */
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

export interface Route {
  csrConfig?: CsrConfig;
  path: string;
  Page?: (({ params, searchParams }) => ReactNode) | (({ params, searchParams }) => Promise<ReactNode>);
  Layout?:
    | (({ children, params, searchParams }) => ReactNode)
    | (({ children, params, searchParams }) => Promise<ReactNode>);
  loader?: () => any;
  pageState?: PageState;
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
  topSafeAreaColor: "transparent",
  bottomSafeAreaColor: "transparent",
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
export interface LocationState {
  location: Location;
  prevLocation: Location | null;
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
  history: RefObject<History>;
  topSafeAreaRef: RefObject<HTMLDivElement | null>;
  bottomSafeAreaRef: RefObject<HTMLDivElement | null>;
  prevPageContentRef: RefObject<HTMLDivElement | null>;
  pageContentRef: RefObject<HTMLDivElement | null>;
  frameRootRef: RefObject<HTMLDivElement | null>;
  onBack: RefObject<{ [K in TransitionType]?: () => Promise<void> }>;
  router: RouterInstance;
  pathRoutes: PathRoute[];
}

export type UseCsrTransition = CsrTransitionStyles & {
  pageBind: (...args: any[]) => ReactDOMAttributes;
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
  pageType: "current" | "prev" | "cached";
  location: Location;
  gestureEnabled: boolean;
  setGestureEnabled: (enabled: boolean) => void;
}
export const pathContext = createContext<PathContextType>({} as unknown as PathContextType);
export const usePathCtx = () => {
  const contextValues = useContext(pathContext);
  return contextValues;
};

export interface PathRoute {
  path: string;
  pathSegments: string[];
  Page: (({ params, searchParams }) => ReactNode) | (({ params, searchParams }) => Promise<ReactNode>);
  pageState: PageState;
  RootLayouts: (
    | (({ children, params, searchParams }) => ReactNode)
    | (({ children, params, searchParams }) => Promise<ReactNode>)
  )[];
  Layouts: (
    | (({ children, params, searchParams }) => ReactNode)
    | (({ children, params, searchParams }) => Promise<ReactNode>)
  )[];
}

export interface RouteGuide {
  pathSegment: string;
  pathRoute?: PathRoute;
  children: { [key: string]: RouteGuide };
}
