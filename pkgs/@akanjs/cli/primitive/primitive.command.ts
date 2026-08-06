import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { type PrimitiveFormat, renderPrimitiveReport, type UiSurface } from "@akanjs/devkit/workflow";
import { Logger } from "akanjs/common";
import { PrimitiveScript } from "./primitive.script";

export class PrimitiveCommand extends command("primitive", [PrimitiveScript], ({ public: target }) => ({
  createUi: target({ desc: "Create a UI surface for a module" })
    .with(Workspace)
    .option("app", String, { desc: "target app or library name", nullable: true })
    .option("module", String, { desc: "target module name", nullable: true })
    .option("surface", String, {
      flag: "u",
      desc: "view, unit, or template",
      default: "template",
      enum: ["view", "unit", "template"],
    })
    .option("format", String, { flag: "o", desc: "output format", default: "markdown", enum: ["markdown", "json"] })
    .exec(async function (workspace, app, module, surface, format) {
      const report = await this.primitiveScript.createUi(workspace, {
        app,
        module,
        surface: surface as UiSurface,
      });
      Logger.rawLog(renderPrimitiveReport(report, format as PrimitiveFormat));
    }),
  addField: target({ desc: "Add a source-limited field to a module constant and dictionary" })
    .with(Workspace)
    .option("app", String, { desc: "target app or library name", nullable: true })
    .option("module", String, { desc: "target module name", nullable: true })
    .option("field", String, { desc: "field name", nullable: true })
    .option("type", String, { desc: "field type or scalar name", nullable: true })
    .option("default", String, { desc: "default value", nullable: true })
    .option("format", String, { flag: "o", desc: "output format", default: "markdown", enum: ["markdown", "json"] })
    .exec(async function (workspace, app, module, field, typeName, defaultValue, format) {
      const report = await this.primitiveScript.addField(workspace, {
        app,
        module,
        field,
        type: typeName,
        defaultValue,
      });
      Logger.rawLog(renderPrimitiveReport(report, format as PrimitiveFormat));
    }),
  addEnumField: target({ desc: "Add a source-limited enum field to a module constant and dictionary" })
    .with(Workspace)
    .option("app", String, { desc: "target app or library name", nullable: true })
    .option("module", String, { desc: "target module name", nullable: true })
    .option("field", String, { desc: "field name", nullable: true })
    .option("values", String, { flag: "l", desc: "comma-separated enum values", nullable: true })
    .option("default", String, { desc: "default value", nullable: true })
    .option("format", String, { flag: "o", desc: "output format", default: "markdown", enum: ["markdown", "json"] })
    .exec(async function (workspace, app, module, field, values, defaultValue, format) {
      const report = await this.primitiveScript.addEnumField(workspace, {
        app,
        module,
        field,
        values,
        defaultValue,
      });
      Logger.rawLog(renderPrimitiveReport(report, format as PrimitiveFormat));
    }),
})) {}
