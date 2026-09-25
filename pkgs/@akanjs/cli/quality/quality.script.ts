import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { formatQualityScanResult } from "@akanjs/devkit/qualityScanner";
import { Logger } from "akanjs/common";

import { QualityRunner } from "./quality.runner";

export class QualityScript extends script("quality", [QualityRunner]) {
  async scan(workspace: Workspace, format: "text" | "json" = "text") {
    const spinner = workspace.spinning("Scanning Akan code quality...");
    const result = await this.qualityRunner.scan(workspace);
    spinner.succeed(`Quality scan completed (${result.scannedFiles} files, ${result.warnings.length} warnings)`);
    Logger.rawLog(format === "json" ? JSON.stringify(result, null, 2) : formatQualityScanResult(result));
  }
}
