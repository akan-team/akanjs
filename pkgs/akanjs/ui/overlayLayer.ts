"use client";
import { useContext, useEffect, useState } from "react";
import { sharedContext } from "../client/sharedContext";

// A portalled overlay leaves its opener's DOM subtree, so `contains` reads a click in it as outside. Context still
// reaches through the portal, so every overlay root is stamped with the scope that rendered it.
export const OVERLAY_LAYER_ATTR = "data-akan-overlay";

// A Popconfirm (and its scrim) outranks a dropdown because `Model.RemoveWrapper` opens one from a menu item, and the
// answering click must not also select in the menu. A Select's options, being a field's, stay under both. A modal
// outranks all of them on `<body>`; an overlay opened inside one portals into its root, so it lands above the panel.
// A tooltip labels whichever of those it sits on, so it tops them all and stays under a modal. An agent's approval
// card tops even a modal: the call it asks about may be one of the modal's own controls.
// The agent's launcher floats over the page but under every menu and modal it would otherwise cover.
// A toast tops a modal: it reports what the modal's own controls did.
// The open agent panel drives every overlay a page opens, so it tops them all.
// Reconnect blocks the whole app on purpose, so nothing tops it.
export const overlayZ = {
  agentLauncher: 80,
  select: 90,
  dropdown: 100,
  popconfirmScrim: 105,
  popconfirm: 110,
  tooltip: 115,
  modal: 120,
  approval: 130,
  toast: 140,
  agentPanel: 150,
  reconnect: 200,
} as const;

const OverlayOwnerContext = sharedContext("overlayOwner", "");

/** Takes the scope from {@link useOverlayScope}. */
export const OverlayOwnerProvider = OverlayOwnerContext.Provider;

/** Nests under the enclosing scope as a `parent/child` path. */
export const useOverlayScope = (id: string) => {
  const parent = useContext(OverlayOwnerContext);
  return parent ? `${parent}/${id}` : id;
};

/** Spread onto every root an overlay portals out of its own tree. */
export const useOverlayLayerProps = () => ({ [OVERLAY_LAYER_ATTR]: useContext(OverlayOwnerContext) });

/** True when the click landed in an overlay `scope`, or a scope nested in it, rendered; any other is outside. */
export const isOwnOverlayClick = (target: EventTarget | null, scope: string) => {
  if (!(target instanceof Element)) return false;
  const owner = target.closest(`[${OVERLAY_LAYER_ATTR}]`)?.getAttribute(OVERLAY_LAYER_ATTR);
  return !!owner && (owner === scope || owner.startsWith(`${scope}/`));
};

const OverlayPortalContext = sharedContext<HTMLElement | null>("overlayPortal", null);

/** Takes the root a modal draws its panel in; overlays rendered under it portal there instead of `<body>`. */
export const OverlayPortalProvider = OverlayPortalContext.Provider;

/** The element an overlay portals into: the enclosing modal's root, else `<body>`. `null` until mounted. */
export const useOverlayPortal = () => {
  const host = useContext(OverlayPortalContext);
  // Set in an effect: the first client pass has to match the server's, which portalled nothing.
  const [body, setBody] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setBody(document.body);
  }, []);
  return host ?? body;
};
