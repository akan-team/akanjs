type Indexable = Record<string, unknown>;

const isIndexable = (value: unknown): value is Indexable => Object(value) === value;

/**
 * Reads a dotted path whose segments may themselves contain the separator.
 *
 * Dictionary keys are built as `<refName>.<value>` and an enum value is a real-world identifier — `gpt-5.6-terra`,
 * `v1.2` — so the key is not a clean dotted path and `pathGet` splits it into segments that were never nodes.
 * The tree stores such a key literally, so resolution has to try joined prefixes too.
 */
export const pathGetLoose = (
  path: string | readonly string[],
  obj: unknown,
  separator = ".",
  fallback: unknown = null,
): unknown => {
  const walk = (node: unknown, rest: readonly string[]): unknown => {
    if (!rest.length) return node;
    if (!isIndexable(node)) return undefined;
    // Shortest prefix first, so every path that resolves under a plain segment-by-segment walk resolves the same way.
    for (let take = 1; take <= rest.length; take += 1) {
      const child = node[rest.slice(0, take).join(separator)];
      if (child === undefined) continue;
      const found = walk(child, rest.slice(take));
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(obj, Array.isArray(path) ? [...path] : (path as string).split(separator)) ?? fallback;
};
