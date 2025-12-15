import type { Lib, Workspace } from "@akanjs/devkit";

import { LibraryRunner } from "./library.runner";

export class LibraryScript {
  #runner = new LibraryRunner();

  async syncLibrary(lib: Lib) {
    const syncSpinner = lib.spinning("Syncing library...");
    const scanInfo = await lib.scan();
    syncSpinner.succeed(`Library ${lib.name} (libs/${lib.name}) is synced`);
    return scanInfo;
  }

  async createLibrary(libName: string, workspace: Workspace) {
    const spinner = workspace.spinning(`Creating ${libName} library`);
    const lib = await this.#runner.createLibrary(libName, workspace);
    spinner.succeed(`${libName} library (libs/${libName}) is created`);
    await this.syncLibrary(lib);
  }
  async removeLibrary(lib: Lib) {
    const spinner = lib.spinning("Removing library...");
    await this.#runner.removeLibrary(lib);
    spinner.succeed(`Library ${lib.name} (libs/${lib.name}) is removed`);
  }

  async installLibrary(workspace: Workspace, libName: string) {
    const installSpinner = workspace.spinning(`Installing ${libName} library`);
    const lib = await this.#runner.installLibrary(workspace, libName);
    installSpinner.succeed(`${libName} library (libs/${libName}) is installed`);
    const mergeSpinner = lib.spinning("Merging library dependencies...");
    await this.#runner.mergeLibraryDependencies(lib);
    mergeSpinner.succeed(`${libName} library (libs/${libName}) dependencies merged to root package.json`);
  }

  async pushLibrary(lib: Lib, branch: string) {
    const pushSpinner = lib.spinning("Pushing library...");
    await this.#runner.pushLibrary(lib, branch);
    pushSpinner.succeed(`Library ${lib.name} (libs/${lib.name}) pushed to ${branch} branch`);
  }

  async pullLibrary(lib: Lib, branch: string) {
    const pullSpinner = lib.spinning("Pulling library...");
    await this.#runner.pullLibrary(lib, branch);
    pullSpinner.succeed(`Library ${lib.name} (libs/${lib.name}) pulled from ${branch} branch`);
    const mergeSpinner = lib.spinning("Merging library dependencies...");
    await this.#runner.mergeLibraryDependencies(lib);
    mergeSpinner.succeed(`Library ${lib.name} (libs/${lib.name}) dependencies merged to root package.json`);
  }

  async testLibrary(lib: Lib) {
    const spinner = lib.spinning("Testing library...");
    await this.#runner.testLibrary(lib);
    spinner.succeed(`Library ${lib.name} (libs/${lib.name}) test is successful`);
  }
}
