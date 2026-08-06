import { command, Lib, Workspace } from "@akanjs/devkit/commandDecorators";
import { LibraryScript } from "./library.script";

export class LibraryCommand extends command("library", [LibraryScript], ({ public: target }) => ({
  createLibrary: target({ desc: "Create a new shared library in the workspace" })
    .arg("libName", String, { desc: "name of library" })
    .with(Workspace)
    .exec(async function (libName, workspace) {
      await this.libraryScript.createLibrary(libName.toLowerCase().replace(/ /g, "-"), workspace);
    }),
  removeLibrary: target({ desc: "Remove a library from the workspace" })
    .with(Lib)
    .exec(async function (lib) {
      await this.libraryScript.removeLibrary(lib);
    }),
  syncLibrary: target({ desc: "Sync dependencies and configuration for a library" })
    .with(Lib)
    .exec(async function (lib) {
      await this.libraryScript.syncLibrary(lib);
    }),
  installLibrary: target({ desc: "Install pre-built library templates (shared, util, etc.)" })
    .arg("libName", String, { desc: "name of library", nullable: true })
    .with(Workspace)
    .exec(async function (libName, workspace) {
      await this.libraryScript.installLibrary(workspace, libName);
    }),
})) {}
