import type { PathContextType } from "akanjs/client";

//? The frame hands a page a fresh `pathRoute` each time it resolves the route, so the route is compared by what readers use.

export const isSamePathValue = (shown: PathContextType, next: PathContextType) =>
  shown.pageKey === next.pageKey &&
  shown.location.href === next.location.href &&
  shown.location.hash === next.location.hash &&
  shown.location.pathRoute.path === next.location.pathRoute.path &&
  shown.location.pathRoute.renderPage === next.location.pathRoute.renderPage &&
  shown.location.entryId === next.location.entryId &&
  shown.followsRouter === next.followsRouter &&
  shown.prefix === next.prefix &&
  shown.gestureEnabled === next.gestureEnabled &&
  shown.registerFrameSlot === next.registerFrameSlot;
