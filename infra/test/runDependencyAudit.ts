import path from "node:path";
import { type AllowlistEntry, type AuditReport, DependencyAudit } from "./audit/DependencyAudit";

/**
 * `bun audit`, split by who installs the vulnerable package.
 *
 *   bun run audit:deps                 exit 1 on a high or critical advisory a consumer of a published package installs
 *   bun run audit:deps --report=<file> read a saved `bun audit --json` instead of asking the registry
 *
 * Runtime is what the dependencies and peerDependencies of the published packages pull in, as bun.lock resolves them;
 * everything else (the root package.json the apps use, devDependencies) is printed and never fails. An advisory that
 * cannot be fixed yet goes into infra/test/audit/allowlist.json with a reason and a revisit date; past that date the
 * entry fails the run again.
 */
const root = path.resolve(import.meta.dir, "../..");
const publishedWorkspaces = [
  "pkgs/akanjs",
  "pkgs/@akanjs/cli",
  "pkgs/@akanjs/devkit",
  "pkgs/@akanjs/native",
  "pkgs/@akanjs/language",
  "pkgs/create-akan-workspace",
  "pkgs/use-agentic",
];

const readReport = async (args: string[]): Promise<AuditReport> => {
  const saved = args.find((arg) => arg.startsWith("--report="))?.slice("--report=".length);
  if (saved) return (await Bun.file(saved).json()) as AuditReport;
  const proc = Bun.spawn(["bun", "audit", "--json"], { cwd: root, stdout: "pipe", stderr: "inherit" });
  const text = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  const report = (() => {
    try {
      return JSON.parse(text) as AuditReport;
    } catch {
      return null;
    }
  })();
  if (!report || (exitCode !== 0 && !Object.keys(report).length)) {
    console.info(`[audit] bun audit exited ${exitCode} without a report, so nothing was checked`);
    process.exit(1);
  }
  return report;
};

const audit = new DependencyAudit(await Bun.file(path.join(root, "bun.lock")).text(), publishedWorkspaces);
const allowlist = (await Bun.file(path.join(import.meta.dir, "audit", "allowlist.json")).json()) as {
  advisories: AllowlistEntry[];
};
const verdict = DependencyAudit.judge(
  audit.findings(await readReport(process.argv.slice(2))),
  allowlist.advisories,
  new Date().toISOString().slice(0, 10),
);
console.info(DependencyAudit.format(verdict).join("\n"));
process.exit(DependencyAudit.failed(verdict) ? 1 : 0);
