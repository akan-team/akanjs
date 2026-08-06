import { App, command, Module } from "@akanjs/devkit/commandDecorators";
import { PageScript } from "./page.script";

export class PageCommand extends command("page", [PageScript], ({ public: target }) => ({
  createCrudPage: target({ desc: "Create CRUD pages for a module (list, detail, create, edit)" })
    .with(App)
    .with(Module)
    .option("basePath", String, { desc: "base path", nullable: true })
    .option("single", Boolean, { desc: "single page", default: false })
    .exec(async function (app, module, basePath, single) {
      await this.pageScript.createCrudPage(module, { app, basePath, single });
    }),
})) {}
