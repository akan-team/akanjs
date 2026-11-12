import path from "node:path";
import type { WorkspaceExecutor } from "../../executors";
import type { AkanSysContext } from "../akanContext";
import { collectRecipeSources, scanRecipes } from "../recipeScanner";
import { type DoctorFindings, repairAction } from "./doctorFindings";

export class RecipeIndexCheck {
  static async run(workspace: WorkspaceExecutor, systems: AkanSysContext[], findings: DoctorFindings) {
    // Doctor never writes, so this is what catches a committed stale recipe index (lint and sync self-heal the tree).
    const scanNames = async (uiDirPath: string, basename?: string) =>
      new Set(scanRecipes(await collectRecipeSources(uiDirPath, "ui", basename)).map((info) => info.name));
    const declaredByImport = new Map<string, Set<string>>();
    declaredByImport.set("akanjs/ui", await scanNames(path.join(workspace.workspaceRoot, "pkgs/akanjs/ui"), "recipe"));
    for (const sys of systems)
      declaredByImport.set(`@${sys.path}/ui`, await scanNames(path.join(workspace.workspaceRoot, sys.path, "ui")));
    // Section slice anchors the heading to a full line — the same string appears back-ticked in prose.
    const sectionOf = (content: string, heading: string) => {
      const match = new RegExp(`^${heading}$`, "m").exec(content);
      if (!match) return "";
      const section = content.slice(match.index);
      const sectionEnd = section.indexOf("\n## ", 1);
      return sectionEnd === -1 ? section : section.slice(0, sectionEnd);
    };
    // `Import from \`<path>\`:` groups with their `- \`name\`` items, so each name checks against its owner.
    const listedByImport = (body: string) => {
      const groups = new Map<string, Set<string>>();
      let current: Set<string> | null = null;
      for (const line of body.split("\n")) {
        const group = /^Import from `([^`]+)`:/.exec(line);
        if (group) {
          current = groups.get(group[1]) ?? new Set();
          groups.set(group[1], current);
          continue;
        }
        const item = /^- `([A-Za-z0-9_$]+)`/.exec(line);
        if (item && current) current.add(item[1]);
        else if (!item) current = null;
      }
      return groups;
    };
    const pushIndexDiagnostic = (indexPath: string, missing: string[], stale: string[], repairCommand: string) => {
      if (missing.length === 0 && stale.length === 0) return;
      const parts = [
        missing.length > 0 ? `${missing.length} declared but unlisted (${missing.slice(0, 5).join(", ")})` : "",
        stale.length > 0 ? `${stale.length} listed but gone (${stale.slice(0, 5).join(", ")})` : "",
      ].filter(Boolean);
      findings.report(
        {
          severity: "error",
          code: "recipe-index-stale",
          path: indexPath,
          message: `${indexPath} recipe index is out of date — ${parts.join("; ")}. Agents read this list as authoritative.`,
        },
        repairAction("generated", repairCommand, "Regenerate the recipe index from the scanned recipes.", true),
      );
    };
    const frameworkDeclared = declaredByImport.get("akanjs/ui") ?? new Set<string>();
    if (frameworkDeclared.size > 0) {
      const agentsMd = await Bun.file(path.join(workspace.workspaceRoot, "AGENTS.md"))
        .text()
        .catch(() => "");
      const listed = listedByImport(sectionOf(agentsMd, "## Recipes")).get("akanjs/ui") ?? new Set<string>();
      pushIndexDiagnostic(
        "AGENTS.md",
        [...frameworkDeclared].filter((name) => !listed.has(name)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        [...listed].filter((name) => !frameworkDeclared.has(name)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
        "akan agent install agents-md",
      );
    }
    for (const sys of systems) {
      const own = declaredByImport.get(`@${sys.path}/ui`) ?? new Set<string>();
      const scopeMd = await Bun.file(path.join(workspace.workspaceRoot, sys.path, "AGENTS.md"))
        .text()
        .catch(() => "");
      const groups = listedByImport(sectionOf(scopeMd, "## Recipes In Scope"));
      const ownListed = groups.get(`@${sys.path}/ui`) ?? new Set<string>();
      const missing = [...own].filter((name) => !ownListed.has(name)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      // Every listed name — the scope's own and its dependency libs' — must still exist at its owner.
      const stale = [...groups.entries()]
        .flatMap(([importFrom, names]) =>
          [...names].filter((name) => !(declaredByImport.get(importFrom) ?? new Set()).has(name)),
        )
        .sort();
      pushIndexDiagnostic(`${sys.path}/AGENTS.md`, missing, stale, `akan sync ${sys.name}`);
    }
  }
}
