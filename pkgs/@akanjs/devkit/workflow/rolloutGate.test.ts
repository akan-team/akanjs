import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { PackageJson } from "../types";
import { findToolingRolloutViolations } from "./rolloutGate";

const manifest = (overrides: Partial<PackageJson>): PackageJson => ({
  name: "fixture",
  version: "0.0.0",
  description: "fixture",
  ...overrides,
});

const workspaceRoot = path.join(import.meta.dir, "../../../..");

const readWorkspaceManifest = (relativePath: string) =>
  Bun.file(path.join(workspaceRoot, relativePath)).json() as Promise<PackageJson>;

const workspacePackageManifestPaths = async () => {
  const rootManifest = await readWorkspaceManifest("package.json");
  const workspaces = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces.filter((workspace): workspace is string => typeof workspace === "string")
    : [];
  const paths = new Set(["package.json"]);
  for (const workspace of workspaces) {
    const glob = new Bun.Glob(`${workspace}/package.json`);
    for await (const relativePath of glob.scan({ cwd: workspaceRoot, onlyFiles: true })) {
      paths.add(relativePath);
    }
  }
  return [...paths].sort();
};

describe("tooling rollout gate", () => {
  test("allows the stable TypeScript Compiler API baseline", () => {
    expect(
      findToolingRolloutViolations(
        manifest({
          dependencies: { typescript: "^6.0.3" },
        }),
      ),
    ).toEqual([]);
  });

  test("rejects reference-only and experiment-only AST dependencies in package manifests", () => {
    const violations = findToolingRolloutViolations(
      manifest({
        dependencies: {
          "@ttsc/graph": "0.1.0",
          "ast-grep": "0.39.0",
          recast: "0.23.11",
          "ts-morph": "27.0.2",
        },
        optionalDependencies: {
          "typescript-go": "0.0.0",
        },
      }),
    );

    expect(violations.map((violation) => `${violation.packageName}:${violation.status}`).sort()).toEqual([
      "@ttsc/graph:reference-only",
      "ast-grep:experiment-only",
      "recast:experiment-only",
      "ts-morph:experiment-only",
      "typescript-go:blocked",
    ]);
  });

  test("rejects TypeScript rc or native-preview toolchain transitions", () => {
    const violations = findToolingRolloutViolations(
      manifest({
        devDependencies: {
          "@typescript/native-preview": "0.0.1",
          typescript: "npm:typescript@rc",
        },
      }),
    );

    expect(violations).toContainEqual(
      expect.objectContaining({
        packageName: "typescript",
        section: "devDependencies",
        status: "blocked",
      }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({
        packageName: "@typescript/native-preview",
        section: "devDependencies",
        status: "blocked",
      }),
    );
  });

  test("keeps workspace package manifests free of blocked AST and graph dependencies", async () => {
    const manifestPaths = await workspacePackageManifestPaths();
    expect(manifestPaths).toEqual(
      expect.arrayContaining([
        "package.json",
        "pkgs/@akanjs/devkit/package.json",
        "pkgs/@akanjs/cli/package.json",
        "pkgs/akanjs/package.json",
        "pkgs/create-akan-workspace/package.json",
      ]),
    );
    const manifests = await Promise.all(manifestPaths.map(readWorkspaceManifest));

    expect(manifests.flatMap(findToolingRolloutViolations)).toEqual([]);
  });
});
