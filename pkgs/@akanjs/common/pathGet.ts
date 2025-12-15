export const pathGet = (
  path: string | (string | number)[],
  obj: any,
  separator = ".",
  fallback: any = null
): unknown => {
  const properties = Array.isArray(path) ? path : path.split(separator);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return properties.reduce((prev: any, curr) => (prev?.[curr] as unknown) ?? (fallback as unknown), obj);
};
