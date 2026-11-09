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
  "akanjs/store/agent",
  "akanjs/base",
  "akanjs/common",
  "akanjs/constant",
  "akanjs/fetch",
  "tailwind-merge",
] as const;

export type VendorSpecifier = (typeof VENDOR_SPECIFIERS)[number];

//? The vendor entries a build narrows to the names its client code imports: each is an ESM `export *`, while React's
//? entries list a CommonJS module's names by hand.
export const NARROWABLE_VENDOR_SPECIFIERS = [
  "akanjs/store",
  "akanjs/store/agent",
  "akanjs/base",
  "akanjs/common",
  "akanjs/constant",
  "akanjs/fetch",
  "tailwind-merge",
] as const satisfies readonly VendorSpecifier[];
