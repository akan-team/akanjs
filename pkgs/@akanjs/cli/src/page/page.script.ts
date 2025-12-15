import { App, Module } from "@akanjs/devkit";

import { PageRunner } from "./page.runner";

export class PageScript {
  #runner = new PageRunner();

  async createCrudPage(
    module: Module,
    { app, basePath, single = false }: { app: App; basePath: string | null; single: boolean }
  ) {
    await this.#runner.createCrudPage(module, { app, basePath, single });
  }
}
