export const hasErrKey = <Key extends string>(
  error: unknown,
  keys: readonly Key[],
): error is { readonly error: Key } => {
  if (typeof error !== "object" || error === null) return false;
  const key = (error as { error?: unknown }).error;
  return typeof key === "string" && (!keys.length || (keys as readonly string[]).includes(key));
};
