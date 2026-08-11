"use client";
import { createContext, useContext } from "react";

/**
 * Overlay surfaces render through `createPortal(document.body)`, so they leave the DOM subtree of the
 * component that opened them, and a dismiss check asking `ref.current.contains(target)` reads every
 * click inside a dialog it opened *itself* as an outside click.
 *
 * React context reaches through a portal where the DOM does not, so an overlay can read which
 * dismissable scope rendered it and stamp that owner on the roots it portals out. A scope then
 * recognises its own overlays exactly, instead of guessing from how close a dialog happens to be.
 */
export const OVERLAY_LAYER_ATTR = "data-akan-overlay";

/** Scope that rendered the surrounding content — empty at page level. */
const OverlayOwnerContext = createContext("");

/** Wrap the content a dismissable container owns, with the scope from {@link useOverlayScope}. */
export const OverlayOwnerProvider = OverlayOwnerContext.Provider;

/** Scope a dismissable container hands to its content. Nests as a `parent/child` path. */
export const useOverlayScope = (id: string) => {
  const parent = useContext(OverlayOwnerContext);
  return parent ? `${parent}/${id}` : id;
};

/** Props an overlay spreads onto every root it portals out of its own tree. */
export const useOverlayLayerProps = () => ({ [OVERLAY_LAYER_ATTR]: useContext(OverlayOwnerContext) });

/**
 * True when the click landed in an overlay that `scope` — or a scope nested inside it — rendered.
 * An overlay nobody owns, and one owned by an unrelated scope, both read as an ordinary outside
 * click, so a menu does not linger behind a dialog it has nothing to do with.
 */
export const isOwnOverlayClick = (target: EventTarget | null, scope: string) => {
  if (!(target instanceof Element)) return false;
  const owner = target.closest(`[${OVERLAY_LAYER_ATTR}]`)?.getAttribute(OVERLAY_LAYER_ATTR);
  return !!owner && (owner === scope || owner.startsWith(`${scope}/`));
};
