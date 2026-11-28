import type { AkanNativeConfig } from "../config.ts";

/** Debug builds install next to the release app: an id suffix like ".debug" and a name suffix like " Dev", per platform. */
export function checkDebugSuffixes(raw: AkanNativeConfig, problems: string[]): void {
  for (const platform of ["android", "ios"] as const) {
    const idSuffix = raw[platform]?.debugAppIdSuffix;
    if (idSuffix !== undefined && (typeof idSuffix !== "string" || !/^(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(idSuffix)))
      problems.push(`${platform}.debugAppIdSuffix must look like ".debug" (got ${JSON.stringify(idSuffix)})`);
    const nameSuffix = raw[platform]?.debugAppNameSuffix;
    if (
      nameSuffix !== undefined &&
      (typeof nameSuffix !== "string" ||
        nameSuffix.length > 24 ||
        !/^ ?[\p{L}\p{N}()_-]+( [\p{L}\p{N}()_-]+)*$/u.test(nameSuffix))
    )
      problems.push(`${platform}.debugAppNameSuffix must look like " Dev" (got ${JSON.stringify(nameSuffix)})`);
  }
}
