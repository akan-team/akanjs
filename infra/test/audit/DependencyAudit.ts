export type Severity = "low" | "moderate" | "high" | "critical";

export interface AuditAdvisory {
  id: number;
  url: string;
  title: string;
  severity: Severity;
  vulnerable_versions: string;
}

export type AuditReport = Record<string, AuditAdvisory[]>;

export interface AllowlistEntry {
  id: string;
  package: string;
  reason: string;
  revisit: string;
}

export interface Finding {
  id: string;
  package: string;
  severity: Severity;
  title: string;
  ranges: string[];
  side: "runtime" | "dev";
  versions: string[];
  via: string[];
}

export interface AuditVerdict {
  failing: Finding[];
  allowed: { finding: Finding; entry: AllowlistEntry }[];
  expired: AllowlistEntry[];
  stale: AllowlistEntry[];
  invalid: AllowlistEntry[];
  printed: Finding[];
}

interface LockDependencies {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalPeers?: string[];
}

interface Lockfile {
  workspaces: Record<string, LockDependencies & { name?: string }>;
  packages: Record<string, unknown[]>;
}

interface Resolved {
  name: string;
  version: string;
  key: string;
}

const failingSeverities: ReadonlySet<Severity> = new Set(["high", "critical"]);
const severityOrder: Severity[] = ["critical", "high", "moderate", "low"];

export class DependencyAudit {
  readonly #lock: Lockfile;
  readonly #runtime = new Map<string, string[]>();

  constructor(lockText: string, publishedWorkspaces: string[]) {
    this.#lock = Bun.JSONC.parse(lockText) as Lockfile;
    this.#walk(publishedWorkspaces);
  }

  get runtimePackages(): ReadonlyMap<string, string[]> {
    return this.#runtime;
  }

  findings(report: AuditReport): Finding[] {
    const findings: Finding[] = [];
    for (const [pkg, advisories] of Object.entries(report)) {
      const runtimeVersions = this.#versionsOf(pkg, true);
      const allVersions = this.#versionsOf(pkg, false);
      const byId = new Map<string, AuditAdvisory[]>();
      for (const advisory of advisories) {
        const id = advisory.url.split("/").pop() || String(advisory.id);
        byId.set(id, [...(byId.get(id) ?? []), advisory]);
      }
      for (const [id, group] of byId) {
        const ranges = group.map((advisory) => advisory.vulnerable_versions);
        const hit = (version: string) => ranges.some((range) => DependencyAudit.#inRange(version, range));
        const runtimeHits = runtimeVersions.filter(hit);
        const first = group[0] as AuditAdvisory;
        findings.push({
          id,
          package: pkg,
          severity: first.severity,
          title: first.title,
          ranges,
          side: runtimeHits.length ? "runtime" : "dev",
          versions: runtimeHits.length ? runtimeHits : allVersions.filter(hit),
          via: runtimeHits.length ? (this.#runtime.get(`${pkg}@${runtimeHits[0]}`) ?? []) : [],
        });
      }
    }
    return findings.sort(
      (a, b) =>
        severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity) || a.package.localeCompare(b.package),
    );
  }

  static judge(findings: Finding[], allowlist: AllowlistEntry[], today: string): AuditVerdict {
    const verdict: AuditVerdict = { failing: [], allowed: [], expired: [], stale: [], invalid: [], printed: [] };
    const used = new Set<AllowlistEntry>();
    verdict.invalid = allowlist.filter((entry) => !DependencyAudit.#isValidEntry(entry));
    const valid = allowlist.filter((entry) => !verdict.invalid.includes(entry));
    for (const finding of findings) {
      if (finding.side === "dev" || !failingSeverities.has(finding.severity)) {
        verdict.printed.push(finding);
        continue;
      }
      const entry = valid.find((item) => item.id === finding.id && item.package === finding.package);
      if (!entry) {
        verdict.failing.push(finding);
        continue;
      }
      used.add(entry);
      verdict.allowed.push({ finding, entry });
    }
    for (const entry of valid) {
      if (!used.has(entry)) verdict.stale.push(entry);
      else if (entry.revisit < today) verdict.expired.push(entry);
    }
    return verdict;
  }

  static format(verdict: AuditVerdict): string[] {
    const line = (finding: Finding) =>
      `${finding.severity.padEnd(8)} ${finding.package}@${finding.versions.join(", ") || "?"} ${finding.id} ${finding.title}`;
    const via = (finding: Finding) => (finding.via.length ? `\n           via ${finding.via.join(" > ")}` : "");
    const lines: string[] = [];
    for (const finding of verdict.printed.filter((item) => item.side === "dev"))
      lines.push(`[audit] dev      ${line(finding)}`);
    for (const finding of verdict.printed.filter((item) => item.side === "runtime"))
      lines.push(`[audit] runtime  ${line(finding)}${via(finding)}`);
    for (const { finding, entry } of verdict.allowed)
      lines.push(
        `[audit] allowed  ${line(finding)}${via(finding)}\n           until ${entry.revisit}: ${entry.reason}`,
      );
    for (const finding of verdict.failing) lines.push(`[audit] FAIL     ${line(finding)}${via(finding)}`);
    for (const entry of verdict.expired)
      lines.push(
        `[audit] FAIL     allowlist entry ${entry.id} (${entry.package}) passed its revisit date ${entry.revisit}`,
      );
    for (const entry of verdict.invalid)
      lines.push(
        `[audit] FAIL     allowlist entry ${entry.id} (${entry.package}) needs a reason and a YYYY-MM-DD revisit date`,
      );
    for (const entry of verdict.stale)
      lines.push(
        `[audit] unused   allowlist entry ${entry.id} (${entry.package}) matches no runtime advisory; remove it`,
      );
    const dev = verdict.printed.filter((item) => item.side === "dev").length;
    const runtimeLow = verdict.printed.length - dev;
    lines.push(
      `[audit] runtime: ${verdict.failing.length} failing, ${verdict.allowed.length} allowed, ${runtimeLow} below high; dev: ${dev} printed, not failed`,
    );
    return lines;
  }

  static failed(verdict: AuditVerdict) {
    return verdict.failing.length > 0 || verdict.expired.length > 0 || verdict.invalid.length > 0;
  }

  static #isValidEntry(entry: Partial<AllowlistEntry>) {
    const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
    if (!text(entry.id) || !text(entry.package) || !text(entry.reason) || typeof entry.revisit !== "string")
      return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.revisit)) return false;
    const date = new Date(`${entry.revisit}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(entry.revisit);
  }

  static #inRange(version: string, range: string) {
    const [, core, prerelease] = /^(\d+\.\d+\.\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(version) ?? [];
    if (!core) return true;
    // Bun.semver keeps a prerelease outside every range without a prerelease bound, `*` included.
    return Bun.semver.satisfies(version, range) || (!!prerelease && Bun.semver.satisfies(core, range));
  }

  #walk(publishedWorkspaces: string[]) {
    const queue: { resolved: Resolved; via: string[] }[] = [];
    const seen = new Set<string>();
    for (const dir of publishedWorkspaces) {
      const workspace = this.#lock.workspaces[dir];
      if (!workspace?.name) throw new Error(`bun.lock has no workspace ${dir}`);
      const names = [
        ...Object.keys(workspace.dependencies ?? {}),
        ...Object.keys(workspace.optionalDependencies ?? {}),
        ...Object.keys(workspace.peerDependencies ?? {}),
      ];
      for (const name of names) {
        const resolved = this.#resolve(workspace.name, name);
        if (resolved) queue.push({ resolved, via: [workspace.name, name] });
      }
    }
    while (queue.length) {
      const next = queue.shift();
      if (!next || seen.has(next.resolved.key)) continue;
      seen.add(next.resolved.key);
      const id = `${next.resolved.name}@${next.resolved.version}`;
      if (!this.#runtime.has(id)) this.#runtime.set(id, next.via);
      for (const name of this.#dependencyNames(next.resolved)) {
        const resolved = this.#resolve(next.resolved.key, name);
        if (resolved && !seen.has(resolved.key)) queue.push({ resolved, via: [...next.via, name] });
      }
    }
  }

  #dependencyNames(resolved: Resolved): string[] {
    const entry = this.#lock.packages[resolved.key] ?? [];
    const workspaceDir = resolved.version.startsWith("workspace:") ? resolved.version.slice("workspace:".length) : null;
    const info = workspaceDir
      ? this.#lock.workspaces[workspaceDir]
      : (entry.find((item, idx) => idx > 0 && typeof item === "object" && item !== null) as
          | LockDependencies
          | undefined);
    if (!info) return [];
    const optionalPeers = new Set(info.optionalPeers ?? []);
    return [
      ...Object.keys(info.dependencies ?? {}),
      ...Object.keys(info.optionalDependencies ?? {}),
      ...Object.keys(info.peerDependencies ?? {}).filter((name) => !optionalPeers.has(name)),
    ];
  }

  #resolve(fromKey: string, name: string): Resolved | null {
    const parents = DependencyAudit.#namesOf(fromKey);
    for (let depth = parents.length; depth >= 0; depth--) {
      const key = [...parents.slice(0, depth), name].join("/");
      const entry = this.#lock.packages[key];
      if (typeof entry?.[0] !== "string") continue;
      const spec = entry[0];
      const at = spec.indexOf("@", 1);
      return { name: spec.slice(0, at), version: spec.slice(at + 1), key };
    }
    return null;
  }

  static #namesOf(key: string): string[] {
    const names: string[] = [];
    const parts = key.split("/");
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx] ?? "";
      names.push(part.startsWith("@") ? `${part}/${parts[++idx] ?? ""}` : part);
    }
    return names;
  }

  #versionsOf(pkg: string, runtimeOnly: boolean): string[] {
    const versions = new Set<string>();
    if (runtimeOnly) {
      for (const id of this.#runtime.keys())
        if (id.startsWith(`${pkg}@`) && id.indexOf("@", 1) === pkg.length) versions.add(id.slice(pkg.length + 1));
    } else
      for (const entry of Object.values(this.#lock.packages)) {
        const spec = entry[0];
        if (typeof spec === "string" && spec.startsWith(`${pkg}@`) && spec.indexOf("@", 1) === pkg.length)
          versions.add(spec.slice(pkg.length + 1));
      }
    return [...versions];
  }
}
