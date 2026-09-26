import { readFileSync } from "node:fs";
import path from "node:path";
import { type DatabaseMode, getEnv } from "../../base/baseEnv";

export interface AppPublicInfo {
  appName: string;
  repoName: string;
  environment: string;
  operationMode: string;
}

export interface AppDetailInfo extends AppPublicInfo {
  akanVersion: string | null;
  buildId: string | null;
  serverMode: string;
  databaseMode: DatabaseMode | null;
  solo: boolean;
  startedAt: string;
  replicaIdx: number | null;
}

export interface AppBuildInfo {
  buildId: string | null;
  akanVersion: string | null;
  builtAt: string | null;
}

export interface AppProcessInfo {
  serverMode: string;
  solo: boolean;
  replicaIdx: number | null;
}

export class AppInfo {
  static readonly publicPath = "/_akan/app/info";
  static readonly buildFileName = "akan.build.json";
  static readonly startedAt = new Date();
  static #build: AppBuildInfo | null = null;

  static public(): AppPublicInfo {
    const { appName, repoName, environment, operationMode } = getEnv();
    return { appName, repoName, environment, operationMode };
  }

  static detail(proc: AppProcessInfo): AppDetailInfo {
    const { buildId, akanVersion } = AppInfo.build();
    return {
      ...AppInfo.public(),
      akanVersion,
      buildId,
      serverMode: proc.serverMode,
      databaseMode: getEnv().databaseMode ?? null,
      solo: proc.solo,
      startedAt: AppInfo.startedAt.toISOString(),
      replicaIdx: proc.replicaIdx,
    };
  }

  //* The image tag a deployment names in AKAN_BUILD_ID wins over the sha `akan build` wrote beside main.js.
  static build(): AppBuildInfo {
    AppInfo.#build ??= AppInfo.#readBuildFile();
    const envBuildId = process.env.AKAN_BUILD_ID?.trim();
    return {
      ...AppInfo.#build,
      buildId: envBuildId || AppInfo.#build.buildId,
      akanVersion: AppInfo.#build.akanVersion ?? AppInfo.#installedAkanVersion(),
    };
  }

  static handlePublic(): Response {
    return Response.json(AppInfo.public(), { headers: { "cache-control": "no-store" } });
  }

  static #readBuildFile(): AppBuildInfo {
    try {
      const raw = JSON.parse(readFileSync(path.join(path.dirname(Bun.main), AppInfo.buildFileName), "utf8")) as
        | Partial<AppBuildInfo>
        | undefined;
      return { buildId: raw?.buildId ?? null, akanVersion: raw?.akanVersion ?? null, builtAt: raw?.builtAt ?? null };
    } catch {
      return { buildId: null, akanVersion: null, builtAt: null };
    }
  }

  static #installedAkanVersion(): string | null {
    try {
      const file = Bun.resolveSync("akanjs/package.json", path.dirname(Bun.main));
      return (JSON.parse(readFileSync(file, "utf8")) as { version?: string }).version ?? null;
    } catch {
      return null;
    }
  }
}
