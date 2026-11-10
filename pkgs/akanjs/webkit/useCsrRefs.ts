"use client";
import { AkanError } from "akanjs/base";
import type { NavigationIntent, PageState, PathRoute, RouterInstance, TransitionType } from "akanjs/client";
import { useRef } from "react";

export const useCsrRefs = () => {
  const pageStateByPathRef = useRef(new Map<string, PageState>());
  const navigationIntentId = useRef(0);
  const transitionPlanId = useRef(0);
  const navigationLocked = useRef(false);
  const pendingNavigation = useRef<NavigationIntent | null>(null);
  const waitingNavigation = useRef<{ kind: "push" | "replace"; href: string; scrollToTop?: boolean } | null>(null);
  const renderCountRef = useRef(0);
  const basePageStateMap = useRef(new WeakMap<PathRoute, PathRoute["pageState"]>());
  const topSafeAreaRef = useRef<HTMLDivElement>(null);
  const bottomSafeAreaRef = useRef<HTMLDivElement>(null);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const prevPageContentRef = useRef<HTMLDivElement>(null);
  const onBack = useRef<{ [K in TransitionType]?: () => Promise<void> }>({});
  const frameRootRef = useRef<HTMLDivElement>(null);
  const lastBroadcastSyncHref = useRef<string | null>(null);
  const syncNavigationReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingSyncNavigation = useRef(false);
  const latestRouter = useRef<RouterInstance | null>(null);
  return {
    pageStateByPathRef,
    navigationIntentId,
    transitionPlanId,
    navigationLocked,
    pendingNavigation,
    waitingNavigation,
    renderCountRef,
    basePageStateMap,
    topSafeAreaRef,
    bottomSafeAreaRef,
    pageContentRef,
    prevPageContentRef,
    onBack,
    frameRootRef,
    lastBroadcastSyncHref,
    syncNavigationReset,
    applyingSyncNavigation,
    latestRouter,
  };
};

export type CsrRefs = ReturnType<typeof useCsrRefs>;

export const currentRouter = ({ current }: CsrRefs["latestRouter"]) => {
  if (!current) throw new AkanError("routerNotReady", "The CSR router was called before useCsrValues rendered it");
  return current;
};
