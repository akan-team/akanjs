import { type Lib, script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { LibraryRunner } from "./library.runner";

export class LibraryScript extends script("library", [LibraryRunner]) {
  async syncLibrary(lib: Lib) {
    const syncSpinner = lib.spinning("Syncing library...");
    const scanInfo = await lib.scan();
    syncSpinner.succeed(`Library ${lib.name} (libs/${lib.name}) is synced`);
    return scanInfo;
  }

  async createLibrary(libName: string, workspace: Workspace) {
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

  async installLibrary(workspace: Workspace, libName: string) {
    const installSpinner = workspace.spinning(`Installing ${libName} library`);
    const lib = await this.libraryRunner.installLibrary(workspace, libName);
    installSpinner.succeed(`${libName} library (libs/${libName}) is installed`);
    const mergeSpinner = lib.spinning("Merging library dependencies...");
    await this.libraryRunner.mergeLibraryDependencies(lib);
    mergeSpinner.succeed(`${libName} library (libs/${libName}) dependencies merged to root package.json`);
  }

  async testLibrary(lib: Lib) {
    const spinner = lib.spinning("Testing library...");
    await this.libraryRunner.testLibrary(lib);
    spinner.succeed(`Library ${lib.name} (libs/${lib.name}) test is successful`);
  }
}
