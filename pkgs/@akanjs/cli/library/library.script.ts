import { type Lib, script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { formatLibStatuses } from "@akanjs/devkit/libSource";
import { assertPlainName } from "@akanjs/devkit/workflow/plainName";
import { Logger } from "akanjs/common";
import { LibraryRunner } from "./library.runner";

export class LibraryScript extends script("library", [LibraryRunner]) {
  async syncLibrary(lib: Lib) {
    const syncSpinner = lib.spinning("Syncing library...");
    const scanInfo = await lib.scan();
    syncSpinner.succeed(`Library ${lib.name} (libs/${lib.name}) is synced`);
    return scanInfo;
  }

  async createLibrary(libName: string, workspace: Workspace) {
    assertPlainName("lib", libName);
    const spinner = workspace.spinning(`Creating ${libName} library`);
    const lib = await this.libraryRunner.createLibrary(libName, workspace);
    spinner.succeed(`${libName} library (libs/${libName}) is created`);
    await this.syncLibrary(lib);
  }
  async removeLibrary(lib: Lib) {
    const spinner = lib.spinning("Removing library...");
    await this.libraryRunner.removeLibrary(lib);
    spinner.succeed(`Library ${lib.name} (libs/${lib.name}) is removed`);
  }

  async libraryStatus(workspace: Workspace, format: "text" | "json" = "text") {
    const spinner = workspace.spinning("Checking library sources...");
    const statuses = await this.libraryRunner.libraryStatuses(workspace);
    const drifted = statuses.filter((status) => status.drift === "drifted").length;
    spinner.succeed(`Checked ${statuses.length} libraries (${drifted} drifted)`);
    Logger.rawLog(format === "json" ? JSON.stringify(statuses, null, 2) : formatLibStatuses(statuses));
  }
  async installLibrary(workspace: Workspace, libName: string) {
    assertPlainName("lib", libName);
    const installSpinner = workspace.spinning(`Installing ${libName} library`);
    const lib = await this.libraryRunner.installLibrary(workspace, libName);
    installSpinner.succeed(`${libName} library (libs/${libName}) is installed`);
    const mergeSpinner = lib.spinning("Merging library dependencies...");
    await this.libraryRunner.mergeLibraryDependencies(lib);
    mergeSpinner.succeed(`${libName} library (libs/${libName}) dependencies merged to root package.json`);
  }
}
