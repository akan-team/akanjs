// Native configuration merged from several sources (akanjs readiness O5-1, architecture review F):
// the shell's own keys, each plugin's, the app's permission texts, then the app's escape hatch
// (native.ios.infoPlist / entitlements). The rules:
// - arrays: union, in order of appearance (a value two plugins add appears once)
// - dictionaries: merged key by key, recursively
// - a scalar that two contributors set differently: a build error naming both
// - the app's own config comes last and wins (it is the final word), except for keys the shell
//   must own (the bundle id, the executable), which nobody else may change
// Object.assign used to drop the first plugin's UIBackgroundModes when a second one set its own.

import { CliError } from "./log.ts";
import type { PlistValue } from "./plist.ts";

export interface PlistSource {
  /** For error messages: "the shell", "plugin push", "the app (native.ios.infoPlist)". */
  who: string;
  values: Record<string, PlistValue | undefined>;
}

type Dict = { [key: string]: PlistValue | undefined };

const isDict = (v: unknown): v is Dict => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merges `sources` in order under the rules above; `final` (the app) wins over them without an
 * error, but may not touch `owned` keys. Throws a CliError listing every conflict.
 */
export function mergePlist(
  sources: PlistSource[],
  final?: PlistSource,
  owned: string[] = [],
): Record<string, PlistValue> {
  const out: Dict = {};
  const owners = new Map<string, string>(); // key path → who set it
  const conflicts: string[] = [];

  const merge = (target: Dict, values: Dict, who: string, path: string, override: boolean) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      const at = path ? `${path}.${key}` : key;
      const current = target[key];
      if (current === undefined) {
        target[key] = structuredClone(value);
        owners.set(at, who);
      } else if (Array.isArray(current) && Array.isArray(value)) {
        for (const item of value) if (!current.some((c) => same(c, item))) current.push(structuredClone(item));
      } else if (isDict(current) && isDict(value)) {
        merge(current, value, who, at, override);
      } else if (!same(current, value)) {
        if (override) {
          target[key] = structuredClone(value);
          owners.set(at, who);
        } else
          conflicts.push(
            `${at}: ${owners.get(at) ?? "?"} sets ${JSON.stringify(current)}, ${who} sets ${JSON.stringify(value)}`,
          );
      }
    }
  };

  for (const source of sources) merge(out, source.values, source.who, "", false);
  if (final) {
    for (const key of owned)
      if (final.values[key] !== undefined) conflicts.push(`${key}: set by akan-native, ${final.who} may not change it`);
    merge(
      out,
      Object.fromEntries(Object.entries(final.values).filter(([key]) => !owned.includes(key))),
      final.who,
      "",
      true,
    );
  }
  if (conflicts.length) throw new CliError(`conflicting native settings:\n  - ${conflicts.join("\n  - ")}`);
  return out as Record<string, PlistValue>;
}
