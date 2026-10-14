//* A verb whose slice guards resolve to none is never mounted, so the client's `fetch` carries no function for it.
export const servedEndpointOf = <Endpoint extends (...args: never[]) => unknown>(
  fetch: object,
  key: string,
): Endpoint | null => {
  const endpoint = (fetch as Record<string, unknown>)[key];
  return typeof endpoint === "function" ? (endpoint as Endpoint) : null;
};
