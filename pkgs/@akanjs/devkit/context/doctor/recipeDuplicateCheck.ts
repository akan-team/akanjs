import path from "node:path";
import type { WorkspaceExecutor } from "../../executors";
import type { AkanSysContext } from "../akanContext";
import { collectRecipeSources, findInlineRecipeDuplicates, scanRecipes } from "../recipeScanner";
import type { DoctorFindings } from "./doctorFindings";

export class RecipeDuplicateCheck {
  static async run(workspace: WorkspaceExecutor, systems: AkanSysContext[], findings: DoctorFindings) {
    //* Advisory only (warning): promoted to lint only if inline re-authoring actually recurs.
    for (const sys of systems) {
      const sources = await collectRecipeSources(path.join(workspace.workspaceRoot, sys.path, "ui"), "ui");
      if (sources.length === 0) continue;
      const recipes = scanRecipes(sources);
      const files: { path: string; content: string }[] = [];
      const glob = new Bun.Glob("**/*.tsx");
      for await (const abs of glob.scan({ cwd: path.join(workspace.workspaceRoot, sys.path), absolute: true })) {
        if (/[\\/](node_modules|\.akan|dist)[\\/]|[\\/]v1[\\/]/.test(abs) || /\.(test|spec)\.tsx$/.test(abs)) continue;
        files.push({
          path: abs,
          content: await Bun.file(abs)
            .text()
            .catch(() => ""),
        });
      }
      const duplicates = findInlineRecipeDuplicates(recipes, files);
      if (duplicates.length === 0) continue;
      const preview = duplicates
        .slice(0, 3)
        .map((duplicate) => `${path.relative(workspace.workspaceRoot, duplicate.path)}:${duplicate.line}`)
        .join(", ");
      findings.push({
        severity: "warning",
        code: "recipe-inline-duplicate",
        path: path.join(sys.path, "ui/Recipe"),
        message: `${sys.name}: ${duplicates.length} inline className(s) re-author a recipe fingerprint (${preview}${duplicates.length > 3 ? ", …" : ""}) — consume the recipe instead.`,
      });
    }
  }
}
