import { getRequestStore } from "akanjs/fetch";

/**
 * Called while a component renders, says what it draws is finished only in a browser (a canvas, a chart drawn in an
 * effect, data read after mount): a `{ static: true }` app drawing it sends no HTML. A no-op in a browser.
 */
export const needsBrowser = (): void => {
  const store = getRequestStore();
  if (store) store.needsBrowser = true;
};
