import { capitalize, pluralize } from "@akanjs/common";
import { type Module, Workspace } from "@akanjs/devkit";

export class ModuleRunner {
  async createModule(
    workspace: Workspace,
    sysType: "app" | "lib",
    sysName: string,
    moduleName: string,
    description: string
  ) {
    //
  }
  async removeModule(module: Module) {
    await module.sys.removeDir(`lib/${module.name}`);
  }

  async createComponentTemplate(module: Module, type: "unit" | "view" | "template" | "zone" | "util") {
    await module.sys.applyTemplate({
      basePath: `./lib/${module.name}`,
      template: `module/__Model__.${capitalize(type)}.tsx`,
      dict: { model: module.name, appName: module.sys.name },
    });
    return {
      component: {
        filename: `${module.name}.${capitalize(type)}.tsx`,
        content: module.sys.readFile(`lib/${module.name}/${capitalize(module.name)}.${capitalize(type)}.tsx`),
      },
      // constant: {
      //   filename: `${name}.constant.ts`,
      //   content: sys.readFile(`lib/__scalar/${name}/${name}.constant.ts`),
      // },
      // dictionary: {
      //   filename: `${name}.dictionary.ts`,
      //   content: sys.readFile(`lib/__scalar/${name}/${name}.dictionary.ts`),
      // },
    };
  }

  async createModuleTemplate(module: Module) {
    const names = pluralize(module.name);
    await module.applyTemplate({
      basePath: `.`,
      template: "module",
      dict: { model: module.name, models: names, sysName: module.sys.name },
    });

    return {
      constant: {
        filename: `${module.name}.constant.ts`,
        content: module.readFile(`${module.name}.constant.ts`),
      },
      dictionary: {
        filename: `${module.name}.dictionary.ts`,
        content: module.readFile(`${module.name}.dictionary.ts`),
      },
      service: {
        filename: `${module.name}.service.ts`,
        content: module.readFile(`${module.name}.service.ts`),
      },
      store: {
        filename: `${module.name}.store.ts`,
        content: module.readFile(`${module.name}.store.ts`),
      },
      signal: {
        filename: `${module.name}.signal.ts`,
        content: module.readFile(`${module.name}.signal.ts`),
      },
      // test: {
      //   filename: `${module.name}.test.ts`,
      //   content: module.readFile(`${module.name}.signal.test.ts`),
      // },
      unit: {
        filename: `${module.name}.Unit.tsx`,
        content: module.readFile(`${module.name}.Unit.tsx`),
      },
      view: {
        filename: `${module.name}.View.tsx`,
        content: module.readFile(`${module.name}.View.tsx`),
      },
      template: {
        filename: `${module.name}.Template.tsx`,
        content: module.readFile(`${module.name}.Template.tsx`),
      },
      zone: {
        filename: `${module.name}.Zone.tsx`,
        content: module.readFile(`${module.name}.Zone.tsx`),
      },
      util: {
        filename: `${module.name}.Util.tsx`,
        content: module.readFile(`${module.name}.Util.tsx`),
      },
    };
  }
}
