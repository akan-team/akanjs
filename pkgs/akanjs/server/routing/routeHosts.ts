import fs from "node:fs";
import path from "node:path";
import { AppHosts, resolveSubRouteHosts } from "akanjs/common";
import { resolveArtifactDir } from "../proxy/hostBasePathWebProxy";
import type { BaseBuildArtifact } from "../types";

//? Declared at boot whatever the web setting: SSO and the origin checks consult these hosts on an api-only server too.
export class RouteHosts {
  static declare(
    artifactDir: string = resolveArtifactDir(),
    subRouteHostsEnv: string | undefined = process.env.AKAN_SUB_ROUTE_HOSTS,
  ): string[] {
    const artifact = RouteHosts.#read(path.join(artifactDir, "base-artifact.json"));
    if (!artifact) return [];
    const { subRoutes } = resolveSubRouteHosts({
      subRoutes: artifact.subRoutes ?? {},
      basePaths: artifact.basePaths ?? [],
      env: subRouteHostsEnv,
    });
    const hosts = [...(artifact.domains ?? []), ...Object.values(subRoutes).flat()];
    AppHosts.declare(hosts);
    return hosts;
  }

  static #read(file: string): Partial<BaseBuildArtifact> | null {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as Partial<BaseBuildArtifact>;
    } catch {
      return null;
    }
  }
}
