import { type App, type Module, script } from "@akanjs/devkit/commandDecorators";
import { PageRunner } from "./page.runner";

export class PageScript extends script("page", [PageRunner]) {
  async createCrudPage(
    module: Module,
    { app, basePath, single = false }: { app: App; basePath: string | null; single: boolean },
  ) {
    await this.pageRunner.createCrudPage(module, { app, basePath, single });
  }
}
