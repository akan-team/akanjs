import { App, Module } from "@akanjs/devkit";

export class PageRunner {
  async createCrudPage(
    module: Module,
    { app, basePath, single = false }: { app: App; basePath: string | null; single: boolean }
  ) {
    await app.applyTemplate({
      basePath: basePath ?? `app/[lang]/(${app.name})/(public)/${module.name}`,
      template: single ? "crudSinglePage" : "crudPages",
      dict: { model: module.name, appName: module.sys.name },
    });
  }
}
