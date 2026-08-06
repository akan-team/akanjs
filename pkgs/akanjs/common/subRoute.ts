import type { AkanI18nConfig } from "./localeConfig";

export const parseBasePaths = (value: string | string[] | Set<string> | undefined | null): string[] => {
  const items =
    typeof value === "string"
      ? value.split(",")
      : value instanceof Set
        ? [...value]
        : Array.isArray(value)
          ? value
          : [];
  return [...new Set(items.map((basePath) => basePath.trim()).filter(Boolean))];
};

const normalizeSubRouteHost = (host: string): string => host.trim().toLowerCase().replace(/:\d+$/, "");

/** A hostname never contains these; a fragment carrying one is a malformed entry, not a host we failed to match. */
const isSubRouteHost = (host: string): boolean => host.length > 0 && !/[\s/=]/.test(host);

/**
 * `"soft=a.com,b.com;office=c.com"` -> `{ soft: ["a.com", "b.com"], office: ["c.com"] }`. A deployment platform
 * renders this value, so a malformed entry is skipped rather than thrown: one bad character must not CrashLoop
 * every pod that received it.
 */
export const parseSubRouteHosts = (value: string | undefined | null): Record<string, string[]> => {
  const hostsByBasePath: Record<string, string[]> = {};
  for (const group of (value ?? "").split(";")) {
    const separatorIdx = group.indexOf("=");
    if (separatorIdx < 0) continue;
    const basePath = group
      .slice(0, separatorIdx)
      .trim()
      .replace(/^\/+|\/+$/g, "");
    if (!basePath) continue;
    const hosts = group
      .slice(separatorIdx + 1)
      .split(",")
      .map(normalizeSubRouteHost)
      .filter(isSubRouteHost);
    if (!hosts.length) continue;
    hostsByBasePath[basePath] = [...new Set([...(hostsByBasePath[basePath] ?? []), ...hosts])];
  }
  return hostsByBasePath;
};

/**
 * Unions the env mapping onto the one baked into the build artifact, never replacing it — dropping the env is the
 * rollback path. A basePath the build does not serve is reported back instead of honoured: the route tree is a
 * build output, so accepting one would answer every request under it with a 404 and nothing to explain why.
 */
export const resolveSubRouteHosts = ({
  subRoutes,
  basePaths,
  env,
}: {
  subRoutes: Record<string, string[]>;
  basePaths: Iterable<string>;
  env?: string | null;
}): { subRoutes: Record<string, string[]>; ignoredBasePaths: string[] } => {
  const parsed = Object.entries(parseSubRouteHosts(env));
  if (!parsed.length) return { subRoutes, ignoredBasePaths: [] };

  const configuredBasePaths = new Set(parseBasePaths([...basePaths]));
  const merged: Record<string, string[]> = { ...subRoutes };
  const ignoredBasePaths: string[] = [];
  for (const [basePath, hosts] of parsed) {
    if (!configuredBasePaths.has(basePath)) {
      ignoredBasePaths.push(basePath);
      continue;
    }
    merged[basePath] = [...new Set([...(merged[basePath] ?? []).map(normalizeSubRouteHost), ...hosts])];
  }
  return { subRoutes: merged, ignoredBasePaths };
};

export const getBasePathFromPathname = (
  pathname: string,
  {
    basePaths,
    i18n,
    headerBasePath,
  }: {
    basePaths: Iterable<string>;
    i18n?: Pick<AkanI18nConfig, "locales" | "defaultLocale">;
    headerBasePath?: string | null;
  },
): string | null => {
  const configuredBasePaths = new Set(parseBasePaths([...basePaths]));
  if (headerBasePath && configuredBasePaths.has(headerBasePath)) return headerBasePath;

  const segments = pathname.split("/").filter(Boolean);
  const locales = new Set(i18n?.locales ?? (i18n?.defaultLocale ? [i18n.defaultLocale] : []));
  const maybeBasePath = locales.has(segments[0] ?? "") ? segments[1] : segments[0];
  return maybeBasePath && configuredBasePaths.has(maybeBasePath) ? maybeBasePath : null;
};
