import { command, Sys } from "@akanjs/devkit/commandDecorators";
import { type PrimitiveFormat, renderPrimitiveReport } from "@akanjs/devkit/workflow";
import { Logger, lowerlize } from "akanjs/common";

import { ScalarScript } from "./scalar.script";

export class ScalarCommand extends command("scalar", [ScalarScript], ({ public: target }) => ({
  createScalar: target({ desc: "Create a new scalar type (simple data model without DB)" })
    .arg("scalarName", String, { desc: "name of scalar" })
    .with(Sys)
    .option("format", String, { flag: "o", desc: "output format", default: "markdown", enum: ["markdown", "json"] })
    .exec(async function (scalarName, sys, format) {
      const name = lowerlize(scalarName.replace(/ /g, ""));
      const report = await this.scalarScript.createScalar(sys, name);
      Logger.rawLog(renderPrimitiveReport(report, format as PrimitiveFormat));
    }),
  removeScalar: target({ desc: "Remove a scalar type from an app or library", destructive: true })
    .arg("scalarName", String, { desc: "name of scalar" })
    .with(Sys)
    .exec(async function (scalarName, sys) {
      await this.scalarScript.removeScalar(sys, scalarName);
    }),
})) {}
