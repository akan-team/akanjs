export const VENDOR_SPECIFIERS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-refresh/runtime",
  "scheduler",
  "react-server-dom-webpack/client.browser",
  "akanjs/store",
  "akanjs/base",
  "akanjs/common",
  "akanjs/constant",
] as const;

export type VendorSpecifier = (typeof VENDOR_SPECIFIERS)[number];
