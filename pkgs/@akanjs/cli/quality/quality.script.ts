import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor, PkgExecutor } from "@akanjs/devkit/executors";
import { MaintainabilityBaseline } from "@akanjs/devkit/quality/maintainabilityBaseline";
import { ObjectImportReport } from "@akanjs/devkit/quality/objectImportReport";
import {
  AkanQualityScanner,
  formatQualityScanResult,
  formatSsrScanResult,
} from "@akanjs/devkit/quality/qualityScanner";
import { RouteRuntimeReport } from "@akanjs/devkit/quality/routeRuntimeReport";
import { RuntimeScopeReport } from "@akanjs/devkit/quality/runtimeScopeReport";
import { Logger } from "akanjs/common";
import { WorkspaceRunner } from "../workspace/workspace.runner";

export class QualityScript extends script("quality", [WorkspaceRunner]) {
  async scan(workspace: Workspace, format: "text" | "json" = "text") {
    const spinner = workspace.spinning("Scanning Akan code quality...");
    const result = await new AkanQualityScanner().scan(workspace.workspaceRoot);
    spinner.succeed(`Quality scan completed (${result.scannedFiles} files, ${result.warnings.length} warnings)`);
    Logger.rawLog(format === "json" ? JSON.stringify(result, null, 2) : formatQualityScanResult(result));
  }

  async ssr(workspace: Workspace, format: "text" | "json" = "text") {
    const spinner = workspace.spinning("Measuring Akan server/client render balance...");
    const scanned = await new AkanQualityScanner().scan(workspace.workspaceRoot);
    const result = { ...scanned, warnings: scanned.warnings.filter((warning) => warning.scope === "ssr") };
    spinner.succeed(`SSR scan completed (${result.scannedFiles} files, ${result.warnings.length} warnings)`);
    Logger.rawLog(format === "json" ? JSON.stringify(result, null, 2) : formatSsrScanResult(result));
  }

  async runtime(workspace: Workspace, format: "text" | "json" = "text") {
    const spinner = workspace.spinning("Reading which client files a page can load module by module...");
    const result = await RuntimeScopeReport.scan(workspace.workspaceRoot);
    const objects = await ObjectImportReport.scan(workspace);
    const builds = await RouteRuntimeReport.read(workspace.workspaceRoot);
    spinner.succeed(`Runtime scan completed (${result.scopes.length} scopes, ${result.notes.length} notes)`);
    if (format === "json") Logger.rawLog(JSON.stringify({ ...result, objects, builds }, null, 2));
    else
      Logger.rawLog(
        [RuntimeScopeReport.format(result), ObjectImportReport.format(objects), RouteRuntimeReport.format(builds)]
          .filter(Boolean)
          .join("\n\n"),
      );
  }

  //* A one-time step when a workspace adopts the maintainability gate; `akan lint` only ever lowers what it records.
  async baseline(workspace: Workspace, { force = false }: { force?: boolean } = {}) {
    const [appNames, libNames, pkgNames] = await workspace.getExecs();
    const execs = [
      ...appNames.map((appName) => AppExecutor.from(workspace, appName)),
      ...libNames.map((libName) => LibExecutor.from(workspace, libName)),
      ...pkgNames.map((pkgName) => PkgExecutor.from(workspace, pkgName)),
    ];
    const { fileName } = MaintainabilityBaseline;
    for (const exec of execs) {
      const contract = await this.workspaceRunner.maintainabilityContractOf(exec);
      const { result, violations } = await contract.seed({ force });
      const outcome = {
        written: `wrote ${fileName} with ${violations.length} entries`,
        kept: `kept the existing ${fileName} (${violations.length} current violations); --force rewrites it`,
        removed: `no violations, removed ${fileName}`,
        clean: "no violations",
      }[result];
      Logger.rawLog(`${contract.sysPath}: ${outcome}`);
    }
  }
}
