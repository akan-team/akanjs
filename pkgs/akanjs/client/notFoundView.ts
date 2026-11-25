declare global {
  var __AKAN_NOT_FOUND_VIEW__: (() => boolean) | undefined;
}

/**
 * Whether the page on screen is the app's not-found view, which a path no page matches, or a page's `notFound()`,
 * draws at the address it was asked for. The web's RSC client and an app's CSR stack each answer it.
 */
export const isNotFoundView = () => globalThis.__AKAN_NOT_FOUND_VIEW__?.() ?? false;
