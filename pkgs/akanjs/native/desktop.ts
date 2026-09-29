//* What an app's or a lib's own native plugin (`native/<id>/src/desktop.ts`) builds its desktop part from; it runs in
//* the desktop shell's Bun, never in a page or the app's server.
export { AkanNativeError, mimeFor } from "@akanjs/native/core";
export type { DesktopContext, DesktopPlugin, NativeEvent } from "@akanjs/native/desktop";
export { createPageVeto, defineDesktopPlugin, externalOpenAllowed } from "@akanjs/native/desktop";
