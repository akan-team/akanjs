/**
 * Add params to a redirect target that may already carry a query.
 *
 * Every signup step hands the next one the prepare-user id through the query, and the caller may already be
 * carrying its own — `?next=…`, where the landing prompt waits out the whole signup wizard. A bare
 * `${redirect}?userId=…` makes the second `?` part of the previous value, so the earlier param survives as
 * garbage and its consumer silently sees nothing.
 */
export const withRedirectQuery = (redirect: string, params: Record<string, string>) => {
  const queryIndex = redirect.indexOf("?");
  const path = queryIndex === -1 ? redirect : redirect.slice(0, queryIndex);
  const query = new URLSearchParams(queryIndex === -1 ? "" : redirect.slice(queryIndex + 1));
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  return search ? `${path}?${search}` : path;
};
