export const ownerOf = (origin: string[] | undefined) => origin?.at(-1);

/**
 * Owners in dependency order, the app first, from origin chains listed in registration order. A lib's modules
 * register before those of whatever builds on it, so the order in which each owner first registers a module of its
 * own, reversed, puts dependents ahead of dependencies; an owner that only extends others' modules comes first.
 */
export const ownerOrderOf = (origins: (string[] | undefined)[]) => {
  const seen: string[] = [];
  for (const origin of origins) {
    const first = origin?.[0];
    if (first && !seen.includes(first)) seen.push(first);
  }
  for (const origin of origins) for (const owner of origin ?? []) if (!seen.includes(owner)) seen.push(owner);
  return seen.reverse();
};

export const originText = (origin: string[]) => {
  const owner = ownerOf(origin) ?? "";
  const bases = origin.slice(0, -1).reverse().join(", ");
  return bases ? { en: `${owner} (extends ${bases})`, ko: `${owner} (${bases} 확장)` } : { en: owner, ko: owner };
};

export const groupByOwner = <Item>(items: Item[], originOf: (item: Item) => string[] | undefined, order: string[]) => {
  const groups = new Map<string, Item[]>(order.map((owner) => [owner, []]));
  for (const item of items) {
    const owner = ownerOf(originOf(item)) ?? "";
    groups.set(owner, [...(groups.get(owner) ?? []), item]);
  }
  return [...groups.entries()].filter(([, grouped]) => grouped.length);
};
