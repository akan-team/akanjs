import type { PackageJson } from "../types";

export type ToolingRolloutDependencySection =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

export type ToolingRolloutCandidateStatus = "allowed" | "reference-only" | "experiment-only" | "blocked";

export interface ToolingRolloutCandidate {
  packageName: string;
  status: ToolingRolloutCandidateStatus;
  role: string;
  adoptionGate: string;
}

export interface ToolingRolloutViolation {
  packageName: string;
  version: string;
  section: ToolingRolloutDependencySection;
  status: Exclude<ToolingRolloutCandidateStatus, "allowed">;
  reason: string;
}

type RestrictedToolingRolloutCandidate = ToolingRolloutCandidate & {
  status: Exclude<ToolingRolloutCandidateStatus, "allowed">;
};

const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const satisfies readonly ToolingRolloutDependencySection[];

export const toolingRolloutCandidates = [
  {
    packageName: "typescript",
    status: "allowed",
    role: "Primary TypeScript Compiler API baseline for AST locator, text splice, and reparse checks.",
    adoptionGate: "Already present; keep using stable Bun-compatible package builds.",
  },
  {
    packageName: "@ttsc/graph",
    status: "reference-only",
    role: "Source-free graph shape and lazy resident model reference.",
    adoptionGate: "Do not add as an Akan runtime dependency without a separate proposal or milestone update.",
  },
  {
    packageName: "ts-morph",
    status: "experiment-only",
    role: "Prototype candidate for complex object literal insertion, import update, and class traversal.",
    adoptionGate: "Use only in isolated prototypes until package size and formatting churn are measured.",
  },
  {
    packageName: "ast-grep",
    status: "experiment-only",
    role: "Prototype candidate for shape detection, CI rules, and migration rules.",
    adoptionGate: "Use as a local rule/check experiment, not as the edit engine.",
  },
  {
    packageName: "recast",
    status: "experiment-only",
    role: "Prototype candidate for formatting preservation.",
    adoptionGate: "Low priority; require proof that formatting churn is lower than the baseline.",
  },
  {
    packageName: "typescript-go",
    status: "blocked",
    role: "TypeScript-Go toolchain transition placeholder.",
    adoptionGate: "Out of scope for Season 2 rollout.",
  },
  {
    packageName: "@typescript/native-preview",
    status: "blocked",
    role: "TypeScript-Go native preview package placeholder.",
    adoptionGate: "Out of scope for Season 2 rollout.",
  },
] as const satisfies readonly ToolingRolloutCandidate[];

export const toolingRolloutGate = {
  schemaVersion: 1,
  strategy: "reference-first-dependency-later",
  dependencyPolicy:
    "Season 2 keeps new AST and graph tooling as references or isolated experiments until a separate proposal or milestone update approves adoption.",
  gateConditions: [
    "Works in Bun runtime and published package artifacts.",
    "Does not break dist/pkgs package verification.",
    "Keeps generated source formatting churn limited.",
    "Reduces add-field regression fixture failures compared with the current TypeScript API baseline.",
    "Does not move MCP responses toward returning source bodies.",
  ],
  candidates: toolingRolloutCandidates,
};

const isRestrictedCandidate = (candidate: ToolingRolloutCandidate): candidate is RestrictedToolingRolloutCandidate =>
  candidate.status !== "allowed";

const restrictedCandidates = new Map<string, RestrictedToolingRolloutCandidate>();
for (const candidate of toolingRolloutCandidates) {
  if (isRestrictedCandidate(candidate)) restrictedCandidates.set(candidate.packageName, candidate);
}

const blockedTypeScriptVersion = (version: string) =>
  /(?:^|[^\w])(?:rc|next|beta|canary|insiders)(?:[^\w]|$)/i.test(version) || /typescript@rc/i.test(version);

export const findToolingRolloutViolations = (packageJson: PackageJson): ToolingRolloutViolation[] => {
  const violations: ToolingRolloutViolation[] = [];

  for (const section of dependencySections) {
    const dependencies = packageJson[section];
    if (!dependencies) continue;

    for (const [packageName, version] of Object.entries(dependencies)) {
      const candidate = restrictedCandidates.get(packageName);
      if (candidate) {
        violations.push({
          packageName,
          version,
          section,
          status: candidate.status,
          reason: candidate.adoptionGate,
        });
        continue;
      }

      if (packageName === "typescript" && blockedTypeScriptVersion(version)) {
        violations.push({
          packageName,
          version,
          section,
          status: "blocked",
          reason: "TypeScript-Go or typescript@rc toolchain transitions are out of scope for Season 2 rollout.",
        });
      }
    }
  }

  return violations;
};
