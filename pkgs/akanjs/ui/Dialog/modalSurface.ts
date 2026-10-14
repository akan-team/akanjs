import { breakpointQuery } from "akanjs/client";

/** How the modal shows on a phone: a centred dialog, a full-screen sheet, or a sheet below `md` and a dialog above. */
export type ModalPresentation = "dialog" | "sheet" | "auto";
/** Where the modal sits from `md` up: centred, or a full-height sheet on the right edge. */
export type ModalPlacement = "center" | "right";

export interface ModalSurfaceProps {
  /** `auto` is a full-screen sheet below `md`, which a drag down on its handle or title dismisses. */
  presentation?: ModalPresentation;
  /** `right` is a full-height side sheet from `md` up. */
  placement?: ModalPlacement;
}

interface SurfaceClassNames {
  root: string;
  panel: string;
  close: string;
  handle: string;
}

// The frame's own inset beside `env()`: an Android WebView before 140 reports `env(safe-area-inset-*)` as 0.
const presentationClassNames: { [presentation in ModalPresentation]: SurfaceClassNames } = {
  dialog: {
    root: "items-center justify-center p-4",
    panel: "max-h-full max-w-2xl rounded-box border border-border",
    close: "top-3",
    handle: "hidden",
  },
  sheet: {
    root: "items-stretch justify-stretch p-0",
    panel:
      "h-full max-h-full max-w-none rounded-none border-0 pt-[max(var(--akan-top-safe-area,0px),env(safe-area-inset-top,0px))] pb-[max(var(--akan-bottom-safe-area,0px),env(safe-area-inset-bottom,0px))]",
    close: "top-[calc(max(var(--akan-top-safe-area,0px),env(safe-area-inset-top,0px))+0.75rem)]",
    handle: "flex",
  },
  auto: {
    root: "items-stretch p-0 md:items-center md:justify-center md:p-4",
    panel:
      "h-full max-h-full rounded-none border-0 pt-[max(var(--akan-top-safe-area,0px),env(safe-area-inset-top,0px))] pb-[max(var(--akan-bottom-safe-area,0px),env(safe-area-inset-bottom,0px))] md:h-auto md:max-w-2xl md:rounded-box md:border md:border-border md:pt-0 md:pb-0",
    close: "top-[calc(max(var(--akan-top-safe-area,0px),env(safe-area-inset-top,0px))+0.75rem)] md:top-3",
    handle: "flex md:hidden",
  },
} as const;

const placementClassNames: { [placement in ModalPlacement]: Pick<SurfaceClassNames, "root" | "panel" | "handle"> } = {
  center: { root: "", panel: "", handle: "" },
  right: {
    root: "md:items-stretch md:justify-end md:p-0",
    panel: "md:h-full md:max-h-full md:max-w-md md:rounded-none md:border-0 md:border-border md:border-l",
    handle: "md:hidden",
  },
} as const;

export const modalSurfaceOf = (presentation: ModalPresentation, placement: ModalPlacement) => {
  const shape = presentationClassNames[presentation];
  const side = placementClassNames[placement];
  return {
    root: [shape.root, side.root],
    panel: [shape.panel, side.panel],
    close: shape.close,
    handle: [shape.handle, side.handle],
  };
};

/** Whether a drag down dismisses: only while the modal is drawn as a sheet at the current width. */
export const isSheetNow = (presentation: ModalPresentation, placement: ModalPlacement) => {
  if (presentation === "dialog") return false;
  const wide = typeof window !== "undefined" && window.matchMedia(breakpointQuery("md")).matches;
  if (!wide) return true;
  return presentation === "sheet" && placement === "center";
};
