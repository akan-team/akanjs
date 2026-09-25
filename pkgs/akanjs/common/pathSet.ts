type MutableIndexable = Record<string | number, unknown>;
type PathSegment = string | number;
type Container = MutableIndexable | Map<PathSegment, unknown>;

const toPathSegments = (path: string | readonly PathSegment[]) =>
  Array.isArray(path) ? [...path] : path.toString().match(/[^.[\]]+/g) || [];

// A `field(Map, …)` value holds its entries outside its own keys, so bracket access would write a stray property
// instead of an entry — and immer would drop it when the draft is finalized.
const readChild = (container: Container, key: PathSegment) =>
  container instanceof Map ? container.get(key) : container[key];

const writeChild = (container: Container, key: PathSegment, value: unknown) => {
  if (container instanceof Map) container.set(key, value);
  else container[key] = value;
};

export const pathSet = <T>(obj: T, path: string | readonly PathSegment[], value: unknown): T => {
  if (Object(obj) !== obj) return obj;
  const pathSegments = toPathSegments(path);
  const parent = pathSegments.slice(0, -1).reduce<Container>((a, c, i) => {
    const child = readChild(a, c);
    if (Object(child) === child) return child as Container;
    const created = Math.abs(Number(pathSegments[i + 1])) >> 0 === +pathSegments[i + 1] ? [] : {};
    writeChild(a, c, created);
    return created as unknown as Container;
  }, obj as Container);
  writeChild(parent, pathSegments[pathSegments.length - 1], value);
  return obj;
};
