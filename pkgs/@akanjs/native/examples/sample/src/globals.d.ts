// Constants defined by build.ts at SPA build time.
declare const __BUILD_TIME__: string;
declare const __BUILD_MODE__: string;

declare module "*.css";

interface Window {
  __AKAN_NATIVE__?: { platform?: string };
}
