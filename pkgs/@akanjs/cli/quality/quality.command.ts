import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { QualityScript } from "./quality.script";

export class QualityCommand extends command("quality", [QualityScript], ({ public: target }) => ({
  quality: target({ desc: "Scan apps and libs for Akan code quality warnings" })
    .arg("action", String, { desc: "quality action", default: "scan", enum: ["scan", "ssr", "baseline"] })
    .option("format", String, { desc: "output format", default: "text", enum: ["text", "json"] })
    .option("force", Boolean, { flag: "F", desc: "baseline: rewrite an existing akan.baseline.json", default: false })
    .with(Workspace)
    .exec(async function (action, format, force, workspace) {
      if (action === "scan") await this.qualityScript.scan(workspace, format);
      else if (action === "ssr") await this.qualityScript.ssr(workspace, format);
      else if (action === "baseline") await this.qualityScript.baseline(workspace, { force });
      else throw new Error(`Unknown quality action: ${action}. Use "scan", "ssr" or "baseline".`);
    }),
})) {}
