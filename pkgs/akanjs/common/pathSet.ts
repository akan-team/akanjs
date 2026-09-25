type MutableIndexable = Record<string | number, unknown>;
type PathSegment = string | number;

const toPathSegments = (path: string | readonly PathSegment[]) =>
  Array.isArray(path) ? [...path] : path.toString().match(/[^.[\]]+/g) || [];

export const pathSet = <T>(obj: T, path: string | readonly PathSegment[], value: unknown): T => {
  if (Object(obj) !== obj) return obj;
  const pathSegments = toPathSegments(path);
  pathSegments.slice(0, -1).reduce<MutableIndexable>((a, c, i) => {
    if (Object(a[c]) === a[c]) return a[c] as MutableIndexable;
    a[c] = Math.abs(Number(pathSegments[i + 1])) >> 0 === +pathSegments[i + 1] ? [] : {};
    return a[c] as MutableIndexable;
  }, obj as MutableIndexable)[pathSegments[pathSegments.length - 1]] = value;
  return obj;
};
