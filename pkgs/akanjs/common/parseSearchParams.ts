export const parseSearchParams = (search: string): { [key: string]: string | string[] } => {
  const params = new Map<string, string | string[]>();
  for (const [key, value] of new URLSearchParams(search)) {
    const current = params.get(key);
    if (current === undefined) params.set(key, value);
    else if (Array.isArray(current)) current.push(value);
    else params.set(key, [current, value]);
  }
  //? `fromEntries` defines each key as an own property, so a `__proto__` key from a URL stays a value, not a prototype.
  return Object.fromEntries(params);
};
