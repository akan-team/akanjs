// Capabilities → resolved ACL for boot.json (requirements PL-11). See packages/core/src/acl.ts for
// the runtime side and docs/architecture.md "권한 ACL" for the model.
//
// Permission identifiers, all derived from the plugin manifest (no permission files):
//   <plugin>:default                 manifest `defaultPermissions` (everything when absent), within the
//                                    manifest `defaultScope` unless the capability gives its own allow
//   <plugin>:all                     every method and event
//   <plugin>:allow-<method>          / deny-<method>
//   <plugin>:allow-listen-<event>    / deny-listen-<event>   ($listen subscriptions)
//   <plugin>:<set>                   a named set from the manifest `permissionSets`
//   core:default, core:allow-print, core:deny-print          shell built-ins (window.print)
// Without `capabilities` in the app config every registered plugin gets its default set.

import type { AclGrant, Platform, ResolvedAcl } from "../../../core/src/index.ts";
import type { Capability, CapabilityPermission } from "../config.ts";
import { CliError } from "./log.ts";
import type { PluginManifest, ResolvedPlugin } from "./project.ts";

export type { Capability, CapabilityPermission } from "../config.ts";

export interface PermissionSet {
  description?: string;
  /** Local identifiers: allow-*, allow-listen-*, other set names, "all". */
  permissions: string[];
}

const PLATFORMS: readonly Platform[] = ["web", "macos", "windows", "linux", "ios", "android"];
const CORE = "core";
const CORE_ITEMS = ["print"];
const NAME = /^[a-z][a-z0-9-]*$/;

type Expanded = { kind: "allow"; items: "*" | string[] } | { kind: "deny"; items: string[] };

/**
 * Every item of a plugin: its methods and `listen:<event>` subscriptions. boot.json names them
 * instead of "*" (architecture review 2026-09-26), so a host never grants a name the manifest does
 * not declare, whatever a module implements.
 */
function everything(manifest: PluginManifest): string[] {
  return [...manifest.methods, ...(manifest.events ?? []).map((e) => `listen:${e}`)];
}

/** One local identifier of a plugin (without "<plugin>:"), or an error message. */
function expandLocal(manifest: PluginManifest, name: string, stack: string[] = []): Expanded | string {
  const id = manifest.id;
  const events = manifest.events ?? [];
  if (name === "all") return { kind: "allow", items: everything(manifest) };
  if (name === "default") {
    if (!manifest.defaultPermissions) return { kind: "allow", items: everything(manifest) };
    return union(manifest, manifest.defaultPermissions, [...stack, "default"]);
  }
  for (const kind of ["allow", "deny"] as const) {
    if (name.startsWith(`${kind}-listen-`)) {
      const event = name.slice(`${kind}-listen-`.length);
      if (!events.includes(event)) return `${id}:${name}: ${id} has no event "${event}"${hint(event, events)}`;
      return { kind, items: [`listen:${event}`] };
    }
    if (name.startsWith(`${kind}-`)) {
      const method = name.slice(kind.length + 1);
      if (!manifest.methods.includes(method))
        return `${id}:${name}: ${id} has no method "${method}"${hint(method, manifest.methods)}`;
      return { kind, items: [method] };
    }
  }
  const set = manifest.permissionSets?.[name];
  if (set) {
    if (stack.includes(name))
      return `${id}: permission set "${name}" includes itself (${[...stack, name].join(" → ")})`;
    return union(manifest, set.permissions, [...stack, name]);
  }
  return `unknown permission ${id}:${name}${hint(name, knownLocal(manifest))}`;
}

function union(manifest: PluginManifest, names: string[], stack: string[]): Expanded | string {
  let items: "*" | Set<string> = new Set();
  for (const name of names) {
    const one = expandLocal(manifest, name, stack);
    if (typeof one === "string") return one;
    if (one.kind === "deny") return `${manifest.id}: "${name}" denies; sets and defaultPermissions may only allow`;
    if (one.items === "*") items = "*";
    else if (items !== "*") for (const item of one.items) items.add(item);
  }
  return { kind: "allow", items: items === "*" ? "*" : [...items] };
}

function knownLocal(manifest: PluginManifest): string[] {
  const events = manifest.events ?? [];
  return [
    "default",
    "all",
    ...manifest.methods.flatMap((m) => [`allow-${m}`, `deny-${m}`]),
    ...events.flatMap((e) => [`allow-listen-${e}`, `deny-listen-${e}`]),
    ...Object.keys(manifest.permissionSets ?? {}),
  ];
}

/** Problems in a plugin manifest's permission fields (checked when the plugin is loaded). */
export function manifestPermissionProblems(manifest: PluginManifest): string[] {
  const problems: string[] = [];
  const id = manifest.id;
  if (manifest.defaultPermissions !== undefined) {
    if (
      !Array.isArray(manifest.defaultPermissions) ||
      !manifest.defaultPermissions.every((p) => typeof p === "string")
    ) {
      problems.push(`${id}: defaultPermissions must be an array of permission names`);
    }
  }
  const sets = manifest.permissionSets;
  if (sets !== undefined) {
    if (!sets || typeof sets !== "object" || Array.isArray(sets))
      problems.push(`${id}: permissionSets must be an object`);
    else {
      for (const [name, set] of Object.entries(sets)) {
        if (
          !NAME.test(name) ||
          name === "default" ||
          name === "all" ||
          name.startsWith("allow-") ||
          name.startsWith("deny-")
        ) {
          problems.push(`${id}: invalid permission set name "${name}" (lowercase, not default/all/allow-*/deny-*)`);
        } else if (!set || !Array.isArray(set.permissions) || !set.permissions.every((p) => typeof p === "string")) {
          problems.push(`${id}: permissionSets.${name}.permissions must be an array of permission names`);
        }
      }
    }
  }
  const scope = manifest.scope;
  if (
    scope !== undefined &&
    (!scope ||
      typeof scope !== "object" ||
      !scope.fields ||
      typeof scope.fields !== "object" ||
      Object.keys(scope.fields).length === 0)
  ) {
    problems.push(`${id}: scope must be { fields: { <name>: "<description>" } }`);
  } else if (scope) {
    for (const key of ["urlFields", "pathFields"] as const) {
      const list = scope[key];
      if (list !== undefined && (!Array.isArray(list) || list.some((f) => !Object.hasOwn(scope.fields, f))))
        problems.push(`${id}: scope.${key} must list fields of scope.fields`);
    }
    // A field named url that is not a URL field would be matched as a plain glob (the old syntax).
    if (Object.hasOwn(scope.fields, "url") && !scope.urlFields?.includes("url"))
      problems.push(`${id}: scope field "url" must be listed in scope.urlFields (URL patterns)`);
  }
  const defaults = manifest.defaultScope;
  if (defaults !== undefined) {
    if (!defaults || typeof defaults !== "object" || Array.isArray(defaults))
      problems.push(`${id}: defaultScope must be { allow?, deny? }`);
    else
      problems.push(
        ...scopeProblems(`${id}: defaultScope.allow`, defaults.allow, manifest),
        ...scopeProblems(`${id}: defaultScope.deny`, defaults.deny, manifest),
      );
  }
  if (problems.length === 0) {
    for (const name of [...(manifest.defaultPermissions ?? []), ...Object.keys(sets ?? {})]) {
      const one = expandLocal(manifest, name);
      if (typeof one === "string") problems.push(one);
      else if (one.kind === "deny") problems.push(`${id}: defaultPermissions may only allow (got ${name})`);
    }
  }
  return problems;
}

function scopeProblems(where: string, entries: unknown, manifest: PluginManifest | null): string[] {
  if (entries === undefined) return [];
  if (!manifest) return [`${where}: core permissions take no scopes`];
  if (!manifest.scope) return [`${where}: plugin ${manifest.id} takes no scopes`];
  if (!Array.isArray(entries)) return [`${where} must be an array of scope entries`];
  const fields = Object.keys(manifest.scope.fields);
  const problems: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${where}: a scope entry must be an object like { ${fields[0]}: "…" }`);
      continue;
    }
    for (const [field, value] of Object.entries(entry)) {
      if (!fields.includes(field))
        problems.push(`${where}: ${manifest.id} scopes have no field "${field}" (fields: ${fields.join(", ")})`);
      else if (typeof value !== "string") problems.push(`${where}: scope field ${field} must be a string (glob)`);
      else problems.push(...patternProblems(where, field, value, manifest));
    }
  }
  return problems;
}

/**
 * Checks the app's capabilities against the registered plugins and resolves them for one platform.
 * Throws a CliError listing every problem.
 */
export function resolveAcl(
  capabilities: Capability[] | undefined,
  plugins: ResolvedPlugin[],
  platform: Platform,
): ResolvedAcl {
  const byId = new Map(plugins.map((p) => [p.manifest.id, p.manifest]));
  const grants: AclGrant[] = [];
  const denied = new Map<string, Set<string>>();
  const problems: string[] = [];

  if (capabilities === undefined) {
    for (const { manifest } of plugins) {
      const expanded = expandLocal(manifest, "default");
      if (typeof expanded === "string") problems.push(expanded);
      else grants.push({ plugin: manifest.id, windows: "*", items: expanded.items, ...defaultScope(manifest, {}) });
    }
  } else if (!Array.isArray(capabilities)) {
    problems.push("capabilities must be an array");
  } else {
    const seen = new Set<string>();
    for (const [index, capability] of capabilities.entries()) {
      const at = `capabilities[${index}]`;
      if (!capability || typeof capability !== "object") {
        problems.push(`${at} must be an object`);
        continue;
      }
      const name = capability.identifier;
      if (typeof name !== "string" || !NAME.test(name))
        problems.push(`${at}.identifier must be lowercase letters, digits and "-" (got ${JSON.stringify(name)})`);
      else if (seen.has(name)) problems.push(`capability "${name}" is defined twice`);
      else seen.add(name);
      const label = typeof name === "string" ? `capability "${name}"` : at;

      let windows: "*" | number[] = "*";
      if (capability.windows !== undefined) {
        if (!Array.isArray(capability.windows) || capability.windows.length === 0)
          problems.push(`${label}: windows must be a non-empty array`);
        else {
          const ids = new Set<number>();
          for (const w of capability.windows) {
            if (w === "*") windows = "*";
            else if (w === "main") ids.add(1);
            else if (typeof w === "number" && Number.isInteger(w) && w > 0) ids.add(w);
            else problems.push(`${label}: windows entries are "main", "*" or window ids (got ${JSON.stringify(w)})`);
          }
          if (!capability.windows.includes("*")) windows = [...ids].sort((a, b) => a - b);
        }
      }
      if (capability.platforms !== undefined) {
        if (!Array.isArray(capability.platforms) || capability.platforms.some((p) => !PLATFORMS.includes(p))) {
          problems.push(`${label}: platforms must list ${PLATFORMS.join(", ")}`);
        }
      }
      const applies = !Array.isArray(capability.platforms) || capability.platforms.includes(platform);
      if (!Array.isArray(capability.permissions)) {
        problems.push(`${label}: permissions must be an array`);
        continue;
      }
      for (const permission of capability.permissions) {
        const entry: CapabilityPermission | null =
          typeof permission === "string"
            ? { identifier: permission }
            : permission && typeof permission === "object"
              ? permission
              : null;
        if (!entry || typeof entry.identifier !== "string") {
          problems.push(
            `${label}: a permission is "<plugin>:<name>" or { identifier, allow?, deny? } (got ${JSON.stringify(permission)})`,
          );
          continue;
        }
        const colon = entry.identifier.indexOf(":");
        const pluginId = colon > 0 ? entry.identifier.slice(0, colon) : "";
        const local = colon > 0 ? entry.identifier.slice(colon + 1) : "";
        const where = `${label}: ${entry.identifier}`;
        let expanded: Expanded | string;
        let manifest: PluginManifest | null = null;
        if (pluginId === CORE) {
          expanded =
            local === "default" || local === "allow-print"
              ? { kind: "allow", items: CORE_ITEMS }
              : local === "deny-print"
                ? { kind: "deny", items: ["print"] }
                : `unknown permission ${entry.identifier}${hint(local, ["default", "allow-print", "deny-print"])}`;
        } else if (!byId.has(pluginId)) {
          expanded = pluginId
            ? `${where}: plugin "${pluginId}" is not in the app's plugins${hint(pluginId, [...byId.keys(), CORE])}`
            : `${where}: expected "<plugin>:<name>"`;
        } else {
          manifest = byId.get(pluginId)!;
          expanded = expandLocal(manifest, local);
        }
        if (typeof expanded === "string") {
          problems.push(expanded.startsWith(label) ? expanded : `${label}: ${expanded}`);
          continue;
        }
        if (expanded.kind === "deny") {
          if (entry.allow !== undefined || entry.deny !== undefined)
            problems.push(`${where}: deny permissions take no scopes (put deny scopes on the allowing permission)`);
          if (applies) {
            const set = denied.get(pluginId) ?? new Set<string>();
            for (const item of expanded.items) set.add(item);
            denied.set(pluginId, set);
          }
          continue;
        }
        const scopeIssues = [
          ...scopeProblems(`${where} allow`, entry.allow, manifest),
          ...scopeProblems(`${where} deny`, entry.deny, manifest),
        ];
        problems.push(...scopeIssues);
        if (!applies || scopeIssues.length) continue;
        const scopes =
          local === "default" && manifest ? defaultScope(manifest, entry) : { allow: entry.allow, deny: entry.deny };
        grants.push({
          plugin: pluginId,
          windows,
          items: expanded.items,
          ...(scopes.allow ? { allow: scopes.allow } : {}),
          ...(scopes.deny ? { deny: scopes.deny } : {}),
        });
      }
    }
  }
  if (problems.length) throw new CliError(`invalid capabilities:\n  - ${problems.join("\n  - ")}`);
  // Shell built-ins stay available unless a capability denies them.
  grants.push({ plugin: CORE, windows: "*", items: CORE_ITEMS });
  const acl: ResolvedAcl = { grants };
  if (denied.size) acl.denied = Object.fromEntries([...denied].map(([plugin, items]) => [plugin, [...items].sort()]));
  return acl;
}

/** The scopes of a `<plugin>:default` grant: the capability's allow, else the manifest's; both denies. */
/**
 * Patterns written in the syntax before the 2026-09-26 architecture review, with the fix: URL
 * patterns name their scheme (one without matches nothing now), and path patterns are relative
 * with "/" separators and no "..".
 */
function patternProblems(where: string, field: string, value: string, manifest: PluginManifest): string[] {
  if (manifest.scope?.urlFields?.includes(field)) {
    if (!/^\**$/.test(value) && !/^[A-Za-z*][A-Za-z0-9+.*-]*:/.test(value)) {
      return [
        `${where}: ${field} "${value}" names no scheme, so it matches nothing; write "https://${value}" (or "*://${value}")`,
      ];
    }
  }
  if (manifest.scope?.pathFields?.includes(field)) {
    if (value.startsWith("/"))
      return [`${where}: ${field} "${value}" is relative to its base: write "${value.replace(/^\/+/, "")}"`];
    if (value.includes("\\"))
      return [`${where}: ${field} "${value}" uses "/" as separator: write "${value.replaceAll("\\", "/")}"`];
    if (value.split("/").includes(".."))
      return [`${where}: ${field} "${value}" cannot contain ".." (paths never leave their base)`];
  }
  return [];
}

/**
 * Scopes that build but likely do not say what the app meant. A URL deny written for https:// only
 * leaves the same host open over http:// (and a URL field matches the scheme exactly).
 */
export function aclWarnings(acl: ResolvedAcl, plugins: ResolvedPlugin[]): string[] {
  const warnings = new Set<string>();
  for (const grant of acl.grants) {
    const urlFields = plugins.find((p) => p.manifest.id === grant.plugin)?.manifest.scope?.urlFields ?? [];
    // An allowed local server without a port: only port 80/443 now (a dev server rarely is).
    for (const entry of grant.allow ?? []) {
      for (const field of urlFields) {
        const m =
          entry[field] === undefined
            ? null
            : /^([a-z*]+):\/\/(localhost|127\.0\.0\.1|\[::1\])(\/.*)?$/i.exec(entry[field]!);
        if (m)
          warnings.add(
            `${grant.plugin}: the allow scope ${field} "${entry[field]}" has no port, so only the default port; write "${m[1]}://${m[2]}:*${m[3] ?? "/*"}" for any port`,
          );
      }
    }
    for (const entry of grant.deny ?? []) {
      for (const field of urlFields) {
        const pattern = entry[field];
        const m = pattern === undefined ? null : /^https:(\/\/.*)$/i.exec(pattern);
        if (!m) continue;
        const covered = (grant.deny ?? []).some(
          (other) =>
            other[field] !== undefined &&
            /^(http|\*|http\*):/i.test(other[field]!) &&
            other[field]!.slice(other[field]!.indexOf(":")) === `:${m[1]}`,
        );
        if (!covered)
          warnings.add(
            `${grant.plugin}: the deny scope ${field} "${pattern}" only covers https://; write "*:${m[1]}" to deny every scheme`,
          );
      }
    }
  }
  return [...warnings];
}

function defaultScope(
  manifest: PluginManifest,
  entry: { allow?: Record<string, string>[]; deny?: Record<string, string>[] },
): Pick<AclGrant, "allow" | "deny"> {
  const allow = entry.allow ?? manifest.defaultScope?.allow;
  const deny = [...(manifest.defaultScope?.deny ?? []), ...(entry.deny ?? [])];
  return { ...(allow ? { allow } : {}), ...(deny.length ? { deny } : {}) };
}

function hint(name: string, known: string[]): string {
  const lower = name.toLowerCase();
  const prefixed =
    lower.length >= 3
      ? known.filter((k) => k.toLowerCase().startsWith(lower)).sort((a, b) => a.length - b.length)[0]
      : undefined;
  if (prefixed) return ` (did you mean "${prefixed}"?)`;
  let best = "";
  let bestDistance = Infinity;
  for (const candidate of known) {
    const d = distance(name.toLowerCase(), candidate.toLowerCase());
    if (d < bestDistance) [best, bestDistance] = [candidate, d];
  }
  return best && bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? ` (did you mean "${best}"?)` : "";
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}
