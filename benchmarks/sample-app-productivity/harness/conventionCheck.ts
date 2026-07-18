#!/usr/bin/env bun
import path from "node:path";
import {
  BENCH_ROOT,
  listFiles,
  matchesAnyGlob,
  parseArgs,
  pathExists,
  readPackageVersions,
  relativeToBench,
  type VerificationSummary,
  workspacePath,
  writeJson,
} from "./lib";

type ConventionSummary = VerificationSummary["convention"];
type ConventionViolation = ConventionSummary["violations"][number];

const AKAN_APP = "apps/taskboard";
const AKAN_MODULES = ["user", "team", "task"];
const AKAN_LAYERS = ["constant", "document", "service", "signal", "store"];
const FORBIDDEN_AKAN_PACKAGES = [
  "@prisma/client",
  "better-sqlite3",
  "drizzle-kit",
  "drizzle-orm",
  "elysia",
  "express",
  "fastify",
  "hono",
  "prisma",
];
const PAGE_PERSISTENCE_PATTERN =
  /\b(?:bun:sqlite|Database\s*\(|\.prepare\s*\(|\.query\s*\(|localStorage|sessionStorage)/;
const PARALLEL_API_PATTERNS = [
  `${AKAN_APP}/api/**`,
  `${AKAN_APP}/routes/**`,
  `${AKAN_APP}/src/**`,
  `${AKAN_APP}/**/api.ts`,
  `${AKAN_APP}/**/routes.ts`,
  `${AKAN_APP}/**/server.ts`,
];

const violation = (id: string, label: string, pathValue?: string, details?: string): ConventionViolation => ({
  id,
  label,
  ...(pathValue ? { path: pathValue } : {}),
  ...(details ? { details } : {}),
});

const checkAkan = async (workspace: string, logFile: string | null): Promise<ConventionSummary> => {
  const started = performance.now();
  const files = await listFiles(workspace);
  const packages = await readPackageVersions(workspace);
  const violations: ConventionViolation[] = [];

  let domainModulesFound = 0;
  let missingLayerCount = 0;
  for (const moduleName of AKAN_MODULES) {
    const modulePath = path.join(workspace, AKAN_APP, "lib", moduleName);
    const moduleRel = path.join(AKAN_APP, "lib", moduleName);
    if (!(await pathExists(modulePath))) {
      violations.push(violation("missing-domain-module", `Missing Akan domain module: ${moduleName}`, moduleRel));
      missingLayerCount += AKAN_LAYERS.length;
      continue;
    }
    domainModulesFound++;
    for (const layer of AKAN_LAYERS) {
      const expected = path.join(modulePath, `${moduleName}.${layer}.ts`);
      if (!(await pathExists(expected))) {
        missingLayerCount++;
        violations.push(
          violation(
            "missing-domain-layer",
            `Missing ${layer} layer for Akan domain module: ${moduleName}`,
            path.join(moduleRel, `${moduleName}.${layer}.ts`),
          ),
        );
      }
    }
  }

  const forbiddenDependencies = Object.keys(packages)
    .filter((pkg) => FORBIDDEN_AKAN_PACKAGES.includes(pkg))
    .sort();
  for (const pkg of forbiddenDependencies) {
    violations.push(
      violation("forbidden-dependency", `Akan stack should not add ${pkg}`, "package.json", `Installed ${pkg}`),
    );
  }

  const parallelApiFiles = files
    .filter((file) => file !== `${AKAN_APP}/server.ts`)
    .filter((file) => matchesAnyGlob(file, PARALLEL_API_PATTERNS))
    .sort();
  for (const file of parallelApiFiles) {
    violations.push(violation("parallel-api-layer", "Akan stack should not create a parallel API/server layer", file));
  }

  const pageFiles = files.filter((file) => file.startsWith(`${AKAN_APP}/page/`) && /\.[tj]sx?$/.test(file));
  const pagePersistenceFiles: string[] = [];
  for (const file of pageFiles) {
    const text = await Bun.file(path.join(workspace, file)).text();
    if (PAGE_PERSISTENCE_PATTERN.test(text)) {
      pagePersistenceFiles.push(file);
      violations.push(violation("page-local-persistence", "Persistence should live outside route files", file));
    }
  }

  const summary: ConventionSummary = {
    success: violations.length === 0,
    checker: "akanjs",
    durationMs: Math.round(performance.now() - started),
    logFile: logFile ? relativeToBench(logFile) : null,
    skipped: false,
    violations,
    metrics: {
      domainModulesExpected: AKAN_MODULES.length,
      domainModulesFound,
      missingLayerCount,
      forbiddenDependencyCount: forbiddenDependencies.length,
      parallelApiFileCount: parallelApiFiles.length,
      pagePersistenceFileCount: pagePersistenceFiles.length,
      violationCount: violations.length,
    },
    note: violations.length
      ? `Akan convention check failed; inspect ${logFile ? relativeToBench(logFile) : "the convention log"}.`
      : `Akan convention check passed; inspect ${logFile ? relativeToBench(logFile) : "the convention log"} if needed.`,
  };

  if (logFile) {
    const lines = [
      `Akan convention check: ${summary.success ? "pass" : "fail"}`,
      `Violations: ${violations.length}`,
      ...violations.map((item) => `- ${item.id}: ${item.path ?? "(workspace)"} ${item.label}`),
    ];
    await Bun.write(logFile, `${lines.join("\n")}\n`);
  }

  return summary;
};

export const runConventionCheck = async (
  checker: "akanjs" | null | undefined,
  workspace: string,
  logFile: string | null,
): Promise<ConventionSummary> => {
  if (!checker) {
    return {
      success: true,
      checker: null,
      durationMs: null,
      logFile: null,
      skipped: true,
      violations: [],
      metrics: {},
      note: "Convention check is not configured for this stack.",
    };
  }
  if (checker === "akanjs") return checkAkan(workspace, logFile);
  throw new Error(`Unknown convention checker: ${checker}`);
};

const main = async () => {
  const args = parseArgs({ run: "smoke" });
  const runId = String(args["run-id"] ?? args.run);
  const stack = String(args.stack ?? "");
  if (!stack) throw new Error("Missing --stack <stackId>");
  const logFile = path.join(BENCH_ROOT, "results", runId, "logs", `${stack}.convention.log`);
  const summary = await runConventionCheck(stack === "akanjs" ? "akanjs" : null, workspacePath(runId, stack), logFile);
  await writeJson(path.join(BENCH_ROOT, "results", runId, `${stack}.convention.json`), summary);
  if (!summary.success) process.exit(1);
};

if (import.meta.main) await main();
