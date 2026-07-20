import type { AkanUiOverrides } from "./context";

/**
 * Typed manifest builder for a `page/_overrides.tsx` file:
 *
 * ```tsx
 * export default override({ Modal: BrandModal });
 * ```
 *
 * It type-checks each binding against that slot's public component contract and rejects unknown slot names as
 * excess properties — so the manifest is validated at compile time and app components need no annotation of
 * their own. Keys are the framework component names (`Modal`), matching `useUiOverride` and the `<Modal>` call
 * sites.
 *
 * It is a pure, server-safe identity function (no React, no `createContext`), so the manifest needs no
 * `"use client"` directive. The framework generates a `"use client"` wrapper layout that reads this map and
 * mounts the override provider around the route subtree (see `writeGeneratedOverridesLayoutFile`).
 */
export const override = (overrides: Partial<AkanUiOverrides>): Partial<AkanUiOverrides> => overrides;
