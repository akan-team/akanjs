import { lazy } from "akanjs/webkit";

/**
 * Every Model export carries its own Suspense boundary.
 *
 * These mount on interaction — a modal body, a dropdown item, a confirm shell — long after the page is
 * painted, and a chunk that resolves then would otherwise suspend all the way to the route and repaint
 * the page as its loading fallback, once per fresh load.
 */
const withSuspense = { suspense: true } as const;

/**
 * A fallback here may only be a host element. This module has no `"use client"`, so a client component
 * referenced from it — `Loading.Skeleton` was the one tried — resolves to `undefined` inside the thunk
 * and the render throws "Element type is invalid", taking the whole page segment under the layout with
 * it. Marking the barrel `"use client"` is worse: `Model.*` becomes a real server→client boundary and
 * apps passing crystalized model instances as props fail serialization at boot. Plain markup crosses
 * neither line.
 *
 * Only the two exports that occupy space of their own get it. The triggers wrap the caller's own
 * children, so a fixed block would put a slab where a small button belongs, and the modals render `null`
 * until opened, so a block would appear where nothing ever shows. For those the collapse is a blink the
 * size of a button; here it is the page body dropping to zero height and snapping back.
 */
const bodyFallback = {
  suspense: true,
  loading: () => <div className="min-h-40 w-full animate-pulse rounded-md bg-muted" />,
} as const;

export const ViewModal = lazy(() => import("./ViewModal"), withSuspense);
export const EditModal = lazy(() => import("./EditModal"), withSuspense);
export const View = lazy(() => import("./View"), bodyFallback);
export const SureToRemove = lazy(() => import("./SureToRemove"), withSuspense);
export const Remove = lazy(() => import("./Remove"), withSuspense);
export const NewWrapper = lazy(() => import("./NewWrapper"), withSuspense);
export const EditWrapper = lazy(() => import("./EditWrapper"), withSuspense);
export const RemoveWrapper = lazy(() => import("./RemoveWrapper"), withSuspense);
export const LoadInit = lazy(() => import("./LoadInit"), withSuspense);
export const LoadView = lazy(() => import("./LoadView"), withSuspense);
export const ViewWrapper = lazy(() => import("./ViewWrapper"), withSuspense);
export const ViewEditModal = lazy(() => import("./ViewEditModal"), withSuspense);
export const Edit = lazy(() => import("./Edit"), withSuspense);
export const New = lazy(() => import("./New"), withSuspense);
export const AdminPanel = lazy(() => import("./AdminPanel"), bodyFallback);
