import { App, Commands, Module, Option, Target } from "@akanjs/devkit";

import { PageScript } from "./page.script";

@Commands()
export class PageCommand {
  pageScript = new PageScript();

  @Target.Public()
  async createCrudPage(
    @App() app: App,
    @Module() module: Module,
    @Option("basePath", { desc: "base path", nullable: true }) basePath: string | null,
    @Option("single", { desc: "single page", default: false }) single: boolean
  ) {
    await this.pageScript.createCrudPage(module, { app, basePath, single });
  }
}
