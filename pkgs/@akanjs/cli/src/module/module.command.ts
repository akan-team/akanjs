import { lowerlize } from "@akanjs/common";
import { Argument, Commands, Module, Option, Sys, Target } from "@akanjs/devkit";

import { ModuleScript } from "./module.script";

@Commands()
export class ModuleCommand {
  moduleScript = new ModuleScript();

  @Target.Public()
  async createModule(
    @Argument("moduleName", { desc: "name of module" }) moduleName: string,
    @Sys() sys: Sys,
    @Option("page", { type: "boolean", desc: "create page", default: false }) page: boolean
    // @Option("description", { desc: "description of module" }) description: string,
    // @Option("schemaDescription", { desc: "schema description of module" }) schemaDescription: string,
    // @Option("ai", { type: "boolean", default: false, desc: "use ai to create module" }) ai: boolean
  ) {
    const name = lowerlize(moduleName.replace(/ /g, ""));
    // if (ai) {
    //   await this.moduleScript.createModule(sys, name, description, schemaDescription);
    // } else {
    await this.moduleScript.createModuleTemplate(sys, name, { page });
    // }
  }

  @Target.Public()
  async removeModule(@Module() module: Module) {
    await this.moduleScript.removeModule(module);
  }

  @Target.Public()
  async createView(@Module() module: Module) {
    await this.moduleScript.createView(module);
  }

  @Target.Public()
  async createUnit(@Module() module: Module) {
    await this.moduleScript.createUnit(module);
  }
  @Target.Public()
  async createTemplate(@Module() module: Module) {
    await this.moduleScript.createTemplate(module);
  }
}
