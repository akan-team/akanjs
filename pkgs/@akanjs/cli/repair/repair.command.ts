import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { RepairScript } from "./repair.script";

export class RepairCommand extends command("repair", [RepairScript], ({ public: target }) => ({
  repair: target({ desc: "Run a narrow Akan repair command and return a structured report" })
    .arg("kind", String, {
      desc: "generated, format, imports, dictionary, or module-shape",
      enum: ["generated", "format", "imports", "dictionary", "module-shape"],
    })
    .with(Workspace)
    .option("format", String, {
      desc: "output format",
      flag: "o",
      default: "markdown",
      enum: ["markdown", "json"],
    })
    .option("app", String, {
      desc: "target app or library for generated/dictionary/module-shape repair",
      nullable: true,
    })
    .option("module", String, { desc: "target module for dictionary/module-shape repair", nullable: true })
    .option("target", String, {
      flag: "t",
      desc: "target app, library, or package for format/imports repair",
      nullable: true,
    })
    .exec(async function (kind, workspace, format, app, module, targetName) {
      await this.repairScript.repair(kind, {
        workspace,
        format: format as "markdown" | "json",
        app,
        module,
        target: targetName,
      });
    }),
})) {}
