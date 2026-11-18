import path from "node:path";
import { type ClientRuntimeScope, StoreBootstrap } from "../artifact/storeBootstrap";
import type { AskedExports } from "./clientBuildTypes";

export interface ClientEntryPart {
  entry: string;
  names: readonly string[];
}

export interface GroupedExport {
  entry: string;
  name: string;
}

//? Bun gives a module a chunk per set of entries reaching it, so entries the same routes load are built as one.
export class ClientEntryGroups {
  static plan<Part extends ClientEntryPart>(
    parts: readonly Part[],
    routesOf: (part: Part) => readonly string[],
  ): Part[][] {
    const groups = new Map<string, Part[]>();
    const alone: Part[][] = [];
    for (const part of parts) {
      const routes = routesOf(part);
      if (routes.length === 0 || part.names.length === 0) alone.push([part]);
      else groups.getOrInsert(routes.toSorted((a, b) => a.localeCompare(b)).join("\n"), []).push(part);
    }
    return [...groups.values(), ...alone];
  }

  static loadedBy(
    entriesByRoute: ReadonlyMap<string, readonly string[]>,
    askedByRoute?: ReadonlyMap<string, AskedExports>,
  ): (part: ClientEntryPart) => string[] {
    const loads = new Map<string, { route: string; asked: readonly string[] | null }[]>();
    for (const [route, entries] of entriesByRoute)
      for (const entry of new Set(entries.map((held) => path.resolve(held))))
        loads.getOrInsert(entry, []).push({ route, asked: askedByRoute?.get(route)?.get(entry) ?? null });
    return ({ entry, names }) =>
      (loads.get(path.resolve(entry)) ?? [])
        .filter(({ asked }) => !asked || names.some((name) => asked.includes(name)))
        .map(({ route }) => route);
  }

  static exportsOf(group: readonly ClientEntryPart[]): Map<string, GroupedExport> {
    const exports = new Map<string, GroupedExport>();
    for (const { entry, names } of group)
      for (const name of names) exports.set(`g${exports.size}`, { entry: path.resolve(entry), name });
    return exports;
  }

  static source(appName: string, exports: ReadonlyMap<string, GroupedExport>, scope: ClientRuntimeScope): string {
    const byEntry = new Map<string, string[]>();
    for (const [alias, { entry, name }] of exports) byEntry.getOrInsert(entry, []).push(`${name} as ${alias}`);
    const lines = [
      ...StoreBootstrap.importLines(appName, scope),
      ...[...byEntry].map(([entry, names]) => `export { ${names.join(", ")} } from ${JSON.stringify(entry)};`),
    ];
    return `${lines.join("\n")}\n`;
  }
}
