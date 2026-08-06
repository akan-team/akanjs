import { type App, type Module, runner } from "@akanjs/devkit/commandDecorators";
export class PageRunner extends runner("page") {
  async createCrudPage(
    module: Module,
    { app, basePath, single = false }: { app: App; basePath: string | null; single: boolean },
  ) {
    await app.applyTemplate({
      basePath: basePath ?? `page/(${app.name})/(public)/${module.name}`,
      template: single ? "crudSinglePage" : "crudPages",
      dict: { model: module.name, appName: module.sys.name },
    });
  }
}
