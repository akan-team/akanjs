import type { Config } from "@jest/types";
import { config } from "dotenv";
import fs from "fs";

export function pathsToModuleNameMapper(
  paths: Record<string, string[]>,
  workspaceRoot: string
): Record<string, string> {
  const moduleNameMapper: Record<string, string> = {};
  const sortedPaths = Object.entries(paths).sort(([a], [b]) => {
    const aHasWildcard = a.includes("*");
    const bHasWildcard = b.includes("*");
    if (aHasWildcard === bHasWildcard) return 0;
    return aHasWildcard ? -1 : 1;
  });
  for (const [tsPath, targetPaths] of sortedPaths) {
    const targetPath = targetPaths[0];
    const escapedPath = tsPath.replace(/[.*+?^${}()|[\]\\]/g, (match) => {
      return match === "*" ? match : `\\${match}`;
    });
    const jestPattern = `^${escapedPath.replace(/\*/g, "(.*)")}$`;
    const jestReplacement = `${workspaceRoot}/${targetPath.replace(/\*/g, "$1")}`;
    moduleNameMapper[jestPattern] = jestReplacement;
  }
  return moduleNameMapper;
}

export const withBase = (name: string): Config.InitialOptions => {
  config();
  process.env.NEXT_PUBLIC_ENV = "testing";
  process.env.NEXT_PUBLIC_OPERATION_MODE = "local";
  process.env.NEXT_PUBLIC_APP_NAME = name;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const workspaceRoot = process.env.AKAN_WORKSPACE_ROOT ?? process.cwd();
  const akanjsPrefix = process.env.USE_AKANJS_PKGS === "true" ? `${workspaceRoot}/pkgs/` : "";
  const akanjsSuffix = process.env.USE_AKANJS_PKGS === "true" ? ".ts" : "";
  const tsconfigPath = `${workspaceRoot}/tsconfig.json`;
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8")) as {
    compilerOptions?: { paths: Record<string, string[]> };
  };
  const paths = tsconfig.compilerOptions?.paths ?? {};
  return {
    displayName: name,
    moduleNameMapper: pathsToModuleNameMapper(paths, workspaceRoot),
    globalSetup: `${akanjsPrefix}@akanjs/test/jest.globalSetup${akanjsSuffix}`,
    setupFilesAfterEnv: [`${akanjsPrefix}@akanjs/test/jest.setupFilesAfterEnv${akanjsSuffix}`],
    globalTeardown: `${akanjsPrefix}@akanjs/test/jest.globalTeardown${akanjsSuffix}`,
    testMatch: ["**/?(*.)+(test).ts?(x)"],
    testPathIgnorePatterns: ["/node_modules/", "/app/"],
    maxWorkers: 1,
    transform: {
      "signal\\.(test)\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
      "^.+\\.(ts|js|html)$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
    },
    moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
    coverageDirectory: `../../coverage/libs/${name}`,
    coverageReporters: ["html"],
    testEnvironment: "node",
    testEnvironmentOptions: {
      customExportConditions: ["node", "require", "default"],
    },
  };
};
