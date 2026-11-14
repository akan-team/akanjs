import { describe, expect, it } from "bun:test";
import { type AuditAdvisory, type AuditReport, DependencyAudit } from "./DependencyAudit";

const lock = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": { "name": "root", "dependencies": { "app-only": "^1.0.0" } },
    "pkgs/pub": {
      "name": "pub",
      "dependencies": { "@scope/lib": "^1.0.0" },
      "peerDependencies": { "peer": "^1.0.0", "optional-peer": "^1.0.0" },
      "optionalPeers": ["optional-peer"],
    },
    "pkgs/other": { "name": "other", "dependencies": { "pub": "workspace:*" } },
  },
  "packages": {
    "pub": ["pub@workspace:pkgs/pub"],
    "other": ["other@workspace:pkgs/other"],
    "@scope/lib": ["@scope/lib@1.2.0", "", { "dependencies": { "shared": "^1.0.0" }, "peerDependencies": { "skipped": "*" }, "optionalPeers": ["skipped"] }, "sha512-a"],
    "@scope/lib/shared": ["shared@1.0.0", "", {}, "sha512-b"],
    "shared": ["shared@2.0.0", "", {}, "sha512-c"],
    "peer": ["peer@1.0.0", "", { "dependencies": { "shared": "^2.0.0" } }, "sha512-d"],
    "optional-peer": ["optional-peer@1.0.0", "", {}, "sha512-e"],
    "skipped": ["skipped@1.0.0", "", {}, "sha512-f"],
    "app-only": ["app-only@1.0.0", "", { "dependencies": { "shared": "^1.0.0" } }, "sha512-g"],
    "app-only/shared": ["shared@1.1.0", "", {}, "sha512-h"],
  }
}`;

const advisory = (ghsa: string, severity: AuditAdvisory["severity"], range: string, id = 1): AuditAdvisory => ({
  id,
  url: `https://github.com/advisories/${ghsa}`,
  title: `${ghsa} title`,
  severity,
  vulnerable_versions: range,
});

describe("DependencyAudit", () => {
  const audit = new DependencyAudit(lock, ["pkgs/pub"]);

  it("walks a published workspace through nested keys, peers and hoisting, but not optional peers", () => {
    expect([...audit.runtimePackages.keys()].sort((a, b) => a.localeCompare(b))).toEqual([
      "@scope/lib@1.2.0",
      "optional-peer@1.0.0",
      "peer@1.0.0",
      "shared@1.0.0",
      "shared@2.0.0",
    ]);
    expect(audit.runtimePackages.get("shared@1.0.0")).toEqual(["pub", "@scope/lib", "shared"]);
  });

  it("puts an advisory on the runtime side only when a runtime version is in its range", () => {
    const report: AuditReport = {
      shared: [advisory("GHSA-run", "high", "<1.0.1"), advisory("GHSA-dev", "high", ">=1.1.0 <1.2.0")],
      "app-only": [advisory("GHSA-app", "critical", "<2.0.0")],
    };
    const sides = Object.fromEntries(audit.findings(report).map((item) => [item.id, [item.side, item.versions]]));
    expect(sides).toEqual({
      "GHSA-app": ["dev", ["1.0.0"]],
      "GHSA-run": ["runtime", ["1.0.0"]],
      "GHSA-dev": ["dev", ["1.1.0"]],
    });
  });

  it("merges the advisory entries one GHSA id has for several version lines", () => {
    const findings = audit.findings({
      shared: [advisory("GHSA-two", "high", ">=2.0.0 <2.0.1", 1), advisory("GHSA-two", "high", "<1.0.1", 2)],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.versions.sort((a, b) => a.localeCompare(b))).toEqual(["1.0.0", "2.0.0"]);
  });

  it("fails only on an unallowed runtime high or critical, and on an allowlist entry past its revisit date", () => {
    const findings = audit.findings({
      shared: [
        advisory("GHSA-fail", "critical", "<1.0.1"),
        advisory("GHSA-allowed", "high", "<1.0.1"),
        advisory("GHSA-moderate", "moderate", "<1.0.1"),
      ],
      "app-only": [advisory("GHSA-app", "critical", "<2.0.0")],
    });
    const allowed = { id: "GHSA-allowed", package: "shared", reason: "r", revisit: "2026-12-01" };
    const stale = { id: "GHSA-gone", package: "shared", reason: "r", revisit: "2026-12-01" };

    const verdict = DependencyAudit.judge(findings, [allowed, stale], "2026-11-14");
    expect(verdict.failing.map((item) => item.id)).toEqual(["GHSA-fail"]);
    expect(verdict.allowed.map((item) => item.entry)).toEqual([allowed]);
    expect(verdict.printed.map((item) => item.id).sort((a, b) => a.localeCompare(b))).toEqual([
      "GHSA-app",
      "GHSA-moderate",
    ]);
    expect(verdict.stale).toEqual([stale]);
    expect(DependencyAudit.failed(verdict)).toBe(true);

    const withoutFail = findings.filter((item) => item.id !== "GHSA-fail");
    expect(DependencyAudit.failed(DependencyAudit.judge(withoutFail, [allowed], "2026-11-14"))).toBe(false);
    const late = DependencyAudit.judge(withoutFail, [allowed], "2026-12-02");
    expect(late.expired).toEqual([allowed]);
    expect(DependencyAudit.failed(late)).toBe(true);
  });

  it("names the run's outcome on its last line", () => {
    const verdict = DependencyAudit.judge(
      audit.findings({ shared: [advisory("GHSA-x", "high", "<1.0.1")] }),
      [],
      "2026-11-14",
    );
    const lines = DependencyAudit.format(verdict);
    expect(lines[0]).toContain("[audit] FAIL     high     shared@1.0.0 GHSA-x");
    expect(lines.at(-1)).toBe("[audit] runtime: 1 failing, 0 allowed, 0 below high; dev: 0 printed, not failed");
  });
});
