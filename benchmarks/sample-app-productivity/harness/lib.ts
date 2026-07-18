import { createHash } from "node:crypto";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const BENCH_ROOT = path.resolve(import.meta.dir, "..");
export const RESULTS_DIR = path.join(BENCH_ROOT, "results");
export const WORKSPACES_DIR = path.join(BENCH_ROOT, "workspaces");
export const SCENARIOS_DIR = path.join(BENCH_ROOT, "scenarios");

export type RunMode = "zero-shot" | "repair-loop" | "human-guided";

export interface CommandSpec {
  cmd: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface VersionCheck {
  file: string;
  path: string;
  expected: string;
}

export interface StackConfig {
  id: string;
  label: string;
  runtime: "bun" | "node";
  packagePolicy: "published-fixed" | "latest-stable-locked";
  allowedPackages: string[];
  promptAppendix?: string | null;
  setup: CommandSpec[];
  installCommand: string[] | null;
  baseUrl: string;
  startCommand: string[];
  buildCommand: string[];
  lintCommand?: string[] | null;
  conventionCheck?: "akanjs" | null;
  versionChecks: VersionCheck[];
}

export interface StackConfigFile {
  scenario: string;
  stacks: StackConfig[];
}

export interface CursorReport {
  model: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  wallClockMs: number | null;
  agentRuns: number | null;
  toolCalls: number | null;
  tokens: {
    input: number | null;
    output: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
    total: number | null;
  };
  notes?: string[];
}

export interface VerificationSummary {
  stack: string;
  runId: string;
  build: {
    success: boolean;
    durationMs: number | null;
    command: string[];
    logFile: string | null;
  };
  tests: {
    success: boolean;
    durationMs: number | null;
    command: string[];
    passed: number | null;
    failed: number | null;
    logFile: string | null;
  };
  lint: {
    success: boolean;
    durationMs: number | null;
    command: string[] | null;
    logFile: string | null;
    skipped: boolean;
    note?: string;
  };
  convention: {
    success: boolean;
    checker: string | null;
    durationMs: number | null;
    logFile: string | null;
    skipped: boolean;
    violations: Array<{ id: string; label: string; path?: string; details?: string }>;
    metrics: Record<string, number | boolean | string | null>;
    note?: string;
  };
  acceptance: Array<{ id: string; label: string; pass: boolean; note?: string }>;
}

export interface RunRecord {
  runId: string;
  scenario: string;
  stack: string;
  stackLabel: string;
  stackVersion: string | null;
  mode: RunMode;
  iteration: number;
  model: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  wallClockMs: number | null;
  installMs: number | null;
  firstImplementationMs: number | null;
  repairMs: number | null;
  tokens: CursorReport["tokens"];
  toolCalls: number | null;
  agentRuns: number | null;
  build: VerificationSummary["build"];
  tests: VerificationSummary["tests"];
  lint: VerificationSummary["lint"];
  convention: VerificationSummary["convention"];
  code: {
    files: number;
    loc: number;
    appSourceLoc: number;
    glueLoc: number;
    testLoc: number;
    generatedOrLockLoc: number;
  };
  quality: {
    duplicateLogicCount: number | null;
    explicitApiClientBoilerplateCount: number | null;
    schemaDuplicationCount: number | null;
    frameworkConfigCount: number | null;
    conventionViolationCount: number | null;
    forbiddenDependencyCount: number | null;
  };
  acceptance: VerificationSummary["acceptance"];
  dependencies: {
    packagePolicy: StackConfig["packagePolicy"];
    lockfile: string | null;
    lockfileHash: string | null;
    packages: Record<string, string>;
    reusedLockfile: boolean | null;
  };
  repairLoop: {
    attempts: number | null;
    maxAttempts: number;
    failureInputs: Array<{ attempt: number; logTypes: string[]; acceptanceFailures: string[] }>;
  };
  cursorWorkspace: {
    path: string;
    mode: RunMode;
  };
  notes: string[];
}

export const ensureDir = async (dir: string): Promise<void> => {
  await mkdir(dir, { recursive: true });
};

export const readJson = async <T>(file: string): Promise<T | null> => {
  const f = Bun.file(file);
  if (!(await f.exists())) return null;
  return (await f.json()) as T;
};

export const writeJson = async (file: string, data: unknown): Promise<void> => {
  await ensureDir(path.dirname(file));
  await Bun.write(file, `${JSON.stringify(data, null, 2)}\n`);
};

export const pathExists = async (file: string): Promise<boolean> => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};

export const loadStackConfig = async (): Promise<StackConfigFile> => {
  const config = await readJson<StackConfigFile>(path.join(BENCH_ROOT, "config", "stacks.json"));
  if (!config) throw new Error("Missing config/stacks.json");
  return config;
};

export const workspacePath = (runId: string, stack: string): string => path.join(WORKSPACES_DIR, runId, stack);

export const resultPath = (runId: string, stack: string, mode: RunMode, iteration: number): string =>
  path.join(RESULTS_DIR, runId, `${stack}__${mode}__${iteration}.json`);

export const verificationPath = (runId: string, stack: string): string =>
  path.join(RESULTS_DIR, runId, `${stack}.verification.json`);

export const setupPath = (runId: string, stack: string): string => path.join(RESULTS_DIR, runId, `${stack}.setup.json`);

export const relativeToBench = (file: string): string => path.relative(BENCH_ROOT, file);

export const replaceVars = (value: string, vars: Record<string, string>): string =>
  Object.entries(vars).reduce((current, [key, replacement]) => current.replaceAll(`{{${key}}}`, replacement), value);

export const renderCommand = (spec: CommandSpec, vars: Record<string, string>): CommandSpec => ({
  ...spec,
  args: spec.args.map((arg) => replaceVars(arg, vars)),
  cwd: spec.cwd ? replaceVars(spec.cwd, vars) : undefined,
});

export const runCommand = async (
  command: string[],
  options: { cwd?: string; env?: Record<string, string>; logFile?: string } = {},
): Promise<{ success: boolean; durationMs: number; exitCode: number | null; output: string }> => {
  const started = performance.now();
  const proc = Bun.spawn(command, {
    cwd: options.cwd ?? BENCH_ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const output = [stdout, stderr].filter(Boolean).join("\n");
  if (options.logFile) {
    await ensureDir(path.dirname(options.logFile));
    await Bun.write(options.logFile, output);
  }
  return {
    success: exitCode === 0,
    durationMs: Math.round(performance.now() - started),
    exitCode,
    output,
  };
};

export interface SpawnedProcess {
  proc: Bun.Subprocess;
  stop: () => Promise<void>;
}

export const spawnLongRunning = async (
  command: string[],
  options: { cwd?: string; env?: Record<string, string>; logFile?: string } = {},
): Promise<SpawnedProcess> => {
  if (options.logFile) await ensureDir(path.dirname(options.logFile));
  const logFile = options.logFile;
  const proc = Bun.spawn(command, {
    cwd: options.cwd ?? BENCH_ROOT,
    env: { ...process.env, ...(options.env ?? {}) },
    stdout: logFile ? "pipe" : "inherit",
    stderr: logFile ? "pipe" : "inherit",
  });
  if (logFile) {
    void Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]).then(([stdout, stderr]) =>
      Bun.write(logFile, [stdout, stderr].filter(Boolean).join("\n")),
    );
  }
  return {
    proc,
    stop: async () => {
      try {
        proc.kill("SIGTERM");
        await Promise.race([proc.exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
      } catch {
        // already exited
      }
      try {
        proc.kill("SIGKILL");
      } catch {
        // already exited
      }
    },
  };
};

export const waitForHttp = async (url: string, timeoutMs = 60_000): Promise<number> => {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.status < 500) return Math.round(performance.now() - started);
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
};

export const hashFile = async (file: string): Promise<string | null> => {
  if (!(await pathExists(file))) return null;
  const bytes = await Bun.file(file).arrayBuffer();
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
};

export const findFirstExisting = async (root: string, names: string[]): Promise<string | null> => {
  for (const name of names) {
    const candidate = path.join(root, name);
    if (await pathExists(candidate)) return candidate;
  }
  return null;
};

export const listFiles = async (root: string): Promise<string[]> => {
  const result: string[] = [];
  const visit = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", "build", ".next", ".vite", ".akan"].includes(entry.name)) continue;
        await visit(full);
      } else if (entry.isFile()) {
        result.push(rel);
      }
    }
  };
  if (!(await pathExists(root))) return result;
  await visit(root);
  return result;
};

export const countFileLines = async (file: string): Promise<number> => {
  const stats = await stat(file);
  if (stats.size === 0) return 0;
  const text = await Bun.file(file).text();
  return text.split("\n").filter((line) => line.trim().length > 0).length;
};

export const readPackageVersions = async (root: string): Promise<Record<string, string>> => {
  const pkg = await readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
    path.join(root, "package.json"),
  );
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
};

export const getByPath = (value: unknown, dottedPath: string): unknown =>
  dottedPath.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);

export const parseArgs = (defaults: Record<string, string | boolean | number> = {}) => {
  const args = process.argv.slice(2);
  const parsed: Record<string, string | boolean | number> = { ...defaults };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i++;
    }
  }
  return parsed;
};

export const median = (values: number[]): number | null => {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

export const globToRegExp = (glob: string): RegExp => {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    const next = glob[i + 1];
    if (char === "*" && next === "*") {
      const after = glob[i + 2];
      if (after === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i++;
      }
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    source += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`^${source}$`);
};

export const matchesAnyGlob = (file: string, patterns: string[]): boolean => {
  const normalized = file.split(path.sep).join("/");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
};
