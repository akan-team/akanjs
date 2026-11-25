import type { RouteOptions } from "./router";

const redirectMoves = new WeakSet<RouteOptions>();

export const redirectMoveOptions = (): RouteOptions => {
  const options: RouteOptions = {};
  redirectMoves.add(options);
  return options;
};

/** Whether a `RouterInstance` was handed the move by `router.redirect()` or `router.notFound()`: the page it was sent
 * from draws nothing. */
export const isRedirectMove = (options: RouteOptions | undefined) => !!options && redirectMoves.has(options);
