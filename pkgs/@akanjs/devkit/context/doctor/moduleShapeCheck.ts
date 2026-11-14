import path from "node:path";
import { capitalize } from "akanjs/common";
import type { WorkspaceExecutor } from "../../executors";
import type { AkanModuleContext, AkanSysContext } from "../akanContext";
import { unlabeledFieldNames } from "../moduleFieldNames";
import { safeReadText } from "../safeRead";
import { type DoctorFindings, repairAction } from "./doctorFindings";

const moduleShapeFiles = (module: AkanModuleContext) => {
  if (module.kind === "service") {
    return [`${module.name}.dictionary.ts`, `${module.name}.service.ts`, `${module.name}.signal.ts`];
  }
  if (module.kind === "scalar") return [`${module.name}.constant.ts`, `${module.name}.dictionary.ts`];
  return [
    `${module.name}.constant.ts`,
    `${module.name}.dictionary.ts`,
    `${module.name}.service.ts`,
    `${module.name}.store.ts`,
    `${module.name}.signal.ts`,
  ];
};

export class ModuleShapeCheck {
  static async run(
    workspace: WorkspaceExecutor,
    systems: AkanSysContext[],
    findings: DoctorFindings,
    { strict }: { strict: boolean },
  ) {
    for (const sys of systems) {
      for (const module of sys.modules) {
        const moduleShapeCommand = `akan repair module-shape --app ${sys.name} --module ${module.name}`;
        if (!module.abstract.exists)
          findings.report(
            {
              severity: strict ? "error" : "warning",
              code: "module-abstract-missing",
              path: module.abstract.path,
              message: `${capitalize(module.kind)} module ${sys.name}:${module.name} should include ${module.abstract.path}`,
            },
            repairAction(
              "module-shape",
              moduleShapeCommand,
              "Create the missing module abstract or inspect required source files.",
              false,
            ),
          );
        const missingFiles = moduleShapeFiles(module).filter((filename) => !module.files.includes(filename));
        if (missingFiles.length)
          findings.report(
            {
              severity: "error",
              code: "module-shape-invalid",
              path: module.path,
              message: `${capitalize(module.kind)} module ${sys.name}:${module.name} is missing required files: ${missingFiles.join(", ")}`,
            },
            repairAction("module-shape", moduleShapeCommand, "Review missing required module source files.", false),
          );
        if (module.kind !== "service" && module.files.includes(`${module.name}.dictionary.ts`)) {
          const constantPath = path.join(workspace.workspaceRoot, module.path, `${module.name}.constant.ts`);
          const dictionaryPath = path.join(workspace.workspaceRoot, module.path, `${module.name}.dictionary.ts`);
          const [constantContent, dictionaryContent] = await Promise.all([
            safeReadText(constantPath),
            safeReadText(dictionaryPath),
          ]);
          if (constantContent && dictionaryContent) {
            for (const fieldName of unlabeledFieldNames(constantContent, dictionaryContent)) {
              findings.report(
                {
                  severity: "warning",
                  code: "dictionary-label-missing",
                  path: `${module.path}/${module.name}.dictionary.ts`,
                  message: `Dictionary labels for ${sys.name}:${module.name}.${fieldName} were not found.`,
                },
                repairAction(
                  "dictionary",
                  `akan repair dictionary --app ${sys.name} --module ${module.name}`,
                  "Add missing dictionary labels for source constant fields.",
                  false,
                ),
              );
            }
          }
        }
      }
    }
  }
}
