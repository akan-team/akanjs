import { command, Module, Sys } from "@akanjs/devkit/commandDecorators";
import { type PrimitiveFormat, renderPrimitiveReport } from "@akanjs/devkit/workflow";
import { Logger, lowerlize } from "akanjs/common";

import { ModuleScript } from "./module.script";

export class ModuleCommand extends command("module", [ModuleScript], ({ public: target }) => ({
  createModule: target({ desc: "Create a new domain module (constant, service, signal, store, UI)" })
    .arg("moduleName", String, { desc: "name of module" })
    .with(Sys)
    .option("page", Boolean, { desc: "create page", default: false })
    .option("ai", Boolean, { desc: "use ai to create module constant and dictionary", default: false })
    .option("format", String, { flag: "o", desc: "output format", default: "markdown", enum: ["markdown", "json"] })
    .exec(async function (moduleName, sys, page, ai, format) {
      const name = lowerlize(moduleName.replace(/ /g, ""));
      const report = ai
        ? await this.moduleScript.createModule(sys, name, { page })
        : await this.moduleScript.createModuleTemplate(sys, name, { page });
      Logger.rawLog(renderPrimitiveReport(report, format as PrimitiveFormat));
    }),
  removeModule: target({ desc: "Remove a module from an app or library" })
    .with(Module)
    .exec(async function (module) {
      await this.moduleScript.removeModule(module);
    }),
  createService: target({ desc: "Create a service module without database files" })
    .arg("serviceName", String, { desc: "name of service module" })
    .with(Sys)
    .option("format", String, { flag: "o", desc: "output format", default: "markdown", enum: ["markdown", "json"] })
    .exec(async function (serviceName, sys, format) {
      const name = lowerlize(serviceName.replace(/ /g, "").replace(/^_+/, ""));
      const report = await this.moduleScript.createService(sys, name);
      Logger.rawLog(renderPrimitiveReport(report, format as PrimitiveFormat));
    }),
  createView: target({ desc: "Create a View component for a module (full page view)" })
    .with(Module)
    .option("format", String, { flag: "o", desc: "output format", default: "markdown", enum: ["markdown", "json"] })
    .exec(async function (module, format) {
      const report = await this.moduleScript.createView(module);
      Logger.rawLog(renderPrimitiveReport(report, format as PrimitiveFormat));
    }),
  createUnit: target({ desc: "Create a Unit component for a module (list/card item)" })
    .with(Module)
    .option("format", String, { flag: "o", desc: "output format", default: "markdown", enum: ["markdown", "json"] })
    .exec(async function (module, format) {
      const report = await this.moduleScript.createUnit(module);
      Logger.rawLog(renderPrimitiveReport(report, format as PrimitiveFormat));
    }),
  createTemplate: target({ desc: "Create a Template component for a module (form)" })
    .with(Module)
    .option("format", String, { flag: "o", desc: "output format", default: "markdown", enum: ["markdown", "json"] })
    .exec(async function (module, format) {
      const report = await this.moduleScript.createTemplate(module);
      Logger.rawLog(renderPrimitiveReport(report, format as PrimitiveFormat));
    }),
})) {}
