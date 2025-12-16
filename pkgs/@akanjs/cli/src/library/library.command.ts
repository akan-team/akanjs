import { Argument, Commands, Lib, Target, Workspace } from "@akanjs/devkit";

import { LibraryScript } from "./library.script";

@Commands()
export class LibraryCommand {
  libraryScript = new LibraryScript();

  @Target.Public()
  async createLibrary(
    @Argument("libName", { desc: "name of library" }) libName: string,
    @Workspace() workspace: Workspace
  ) {
    await this.libraryScript.createLibrary(libName.toLowerCase().replace(/ /g, "-"), workspace);
  }
  @Target.Public()
  async removeLibrary(@Lib() lib: Lib) {
    await this.libraryScript.removeLibrary(lib);
  }

  @Target.Public()
  async syncLibrary(@Lib() lib: Lib) {
    await this.libraryScript.syncLibrary(lib);
  }

  // @Target.Public()
  // async buildLibrary(@Lib() lib: Lib) {
  //   //
  // }

  @Target.Public()
  async installLibrary(
    @Argument("libName", { desc: "name of library", nullable: true }) libName: string,
    @Workspace() workspace: Workspace
  ) {
    await this.libraryScript.installLibrary(workspace, libName);
  }
}
