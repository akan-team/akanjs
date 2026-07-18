import { command, Workspace } from "@akanjs/devkit";

import { QualityScript } from "./quality.script";

export class QualityCommand extends command("quality", [QualityScript], ({ public: target }) => ({
  quality: target({ desc: "Scan apps and libs for Akan code quality warnings" })
    .arg("action", String, {
      desc: "quality action",
      default: "scan",
      enum: ["scan"],
    })
    .option("format", String, {
      desc: "output format",
      default: "text",
      enum: ["text", "json"],
    })
    .with(Workspace)
    .exec(async function (action, format, workspace) {
      if (action !== "scan") throw new Error(`Unknown quality action: ${action}. Use "scan".`);
      await this.qualityScript.scan(workspace, format as "text" | "json");
    }),
})) {}
