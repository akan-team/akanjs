"use client";
import { useContext } from "react";

import { type AkanUiRecipes, UiOverrideContext } from "./context";

/**
 * Resolves the active recipe swap for a framework recipe slot in the current route
 * subtree, or `undefined` when no `_overrides.tsx` in the ancestry declares one.
 * Framework components consume it as `const recipe = useUiRecipe("button") ?? buttonRecipe;`
 * so an app can restyle every instance app/route-wide without touching behavior.
 */
export const useUiRecipe = <K extends keyof AkanUiRecipes>(name: K): AkanUiRecipes[K] | undefined => {
  const { recipes } = useContext(UiOverrideContext);
  return recipes?.[name];
};
