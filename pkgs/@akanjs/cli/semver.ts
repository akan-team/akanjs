// `Bun.semver.order` compares range strings loosely — `^3.1049.0` vs `^3.721.0` answers 0 — so the
// operator prefix has to come off before it sees the version.
const stripRangeOperator = (version: string) => version.replace(/^[\s^~>=<v]+/, "").trim();

const parseVersion = (version: string): number[] => {
  return version
    .replace(/^[^\d]*/, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
};

const compareNumeric = (a: string, b: string): number => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
};

export const compareSemver = (a: string, b: string): number => {
  try {
    return Bun.semver.order(stripRangeOperator(a), stripRangeOperator(b));
  } catch {
    // Not every dependency spec is a version — `workspace:*`, a git URL, a tarball path.
    return compareNumeric(a, b);
  }
};
