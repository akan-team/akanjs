export type LiveSortableRow = { [key: string]: unknown };

export interface LivePlacementProps {
  list: LiveSortableRow[];
  row: LiveSortableRow;
  page: number;
  limit: number;
  /** Whether the list is pages `1..N` concatenated rather than one window. */
  cumulative: boolean;
  hasMore: boolean;
  sortKey: string;
  /** The sort keys the slice declared a subscriber may reproduce. */
  allowedSorts: string[];
  sorts: { [key: string]: { [path: string]: 1 | -1 } } | undefined;
}

// Null means refetch. Needs an allowlisted sort, page 1 (a later page's boundary would shift unseen), and every sorted
// field on the row (a missing one has no place).
export const livePlacementIndex = ({
  list,
  row,
  page,
  limit,
  cumulative,
  hasMore,
  sortKey,
  allowedSorts,
  sorts,
}: LivePlacementProps): number | null => {
  if (page !== 1) return null;
  if (!allowedSorts.includes(sortKey)) return null;
  const sort = sorts?.[sortKey];
  if (!sort || !Object.keys(sort).length) return null;
  const paths = Object.entries(sort);
  if (paths.some(([path]) => comparableOf(row[path]) === undefined)) return null;
  let orderable = true;
  const index = list.findIndex((item) => {
    const order = compareRows(row, item, paths);
    orderable = order !== null;
    return order === null || order < 0;
  });
  if (!orderable) return null;
  if (index !== -1) return index;
  // Past the rows in hand: a full paged window is followed by the next page, a cumulative list by `hasMore` rows.
  if (cumulative) return hasMore ? null : list.length;
  return list.length < limit ? list.length : null;
};

// The order `QueryCompiler.orderBy` asks SQL for: NULL below every value, then `id` in the last key's direction.
const compareRows = (left: LiveSortableRow, right: LiveSortableRow, paths: [string, 1 | -1][]): number | null => {
  for (const [path, direction] of paths) {
    const order = compareValues(comparableOf(left[path]), comparableOf(right[path]));
    if (order !== 0) return order === null ? null : order * direction;
  }
  const order = compareValues(comparableOf(left.id), comparableOf(right.id));
  return order === null ? null : order * (paths.at(-1)?.[1] ?? -1);
};

const compareValues = (a: Comparable | undefined, b: Comparable | undefined): number | null => {
  if (a === undefined || b === undefined) return null;
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === "string" && typeof b === "string") return compareText(a, b);
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
  return null;
};

// SQL compares text as UTF-8 bytes, which is code point order; `<` compares UTF-16 units, putting "😀" below "ｱ".
const compareText = (a: string, b: string) => {
  let idx = 0;
  while (idx < a.length && idx < b.length && a[idx] === b[idx]) idx += 1;
  return (a.codePointAt(idx) ?? -1) < (b.codePointAt(idx) ?? -1) ? -1 : 1;
};

type Comparable = number | string | null;

// Undefined when the value has no place in a SQL order. Dayjs dates go through `valueOf`: `<` on two objects compares
// their string forms.
const comparableOf = (value: unknown): Comparable | undefined => {
  if (value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  const valued: unknown = (value as { valueOf?: () => unknown } | undefined)?.valueOf?.();
  if (typeof valued === "number" || typeof valued === "string") return valued;
  return undefined;
};
