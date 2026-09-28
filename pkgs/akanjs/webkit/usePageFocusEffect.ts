"use client";
import { pageActivityContext } from "akanjs/client";
import { type DependencyList, type EffectCallback, useContext, useEffect } from "react";

/**
 * Runs `effect` while the user is on this page, and cleans it up when they leave it — for work a mounted page
 * must not keep doing out of sight, such as a camera, a poll, or a key binding. A page under the current one stays
 * mounted for a swipe back, so a plain effect there keeps running.
 */
export const usePageFocusEffect = (effect: EffectCallback, deps: DependencyList) => {
  const { focused } = useContext(pageActivityContext);
  useEffect(() => (focused ? effect() : undefined), [focused, ...deps]);
};
