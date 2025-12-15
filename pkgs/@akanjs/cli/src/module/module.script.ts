import { capitalize, randomPicks } from "@akanjs/common";
import { AiSession, App, getRelatedCnsts, type Module, ModuleExecutor, type Sys, Workspace } from "@akanjs/devkit";
import fs from "fs";

import { PageScript } from "../page/page.script";
import * as request from "./module.request";
import { ModuleRequest } from "./module.request";
import { ModuleRunner } from "./module.runner";

export class ModuleScript {
  pageScript = new PageScript();
  #runner = new ModuleRunner();

  async createModuleTemplate(sys: Sys, name: string, { page = false }: { page?: boolean } = {}) {
    const mod = ModuleExecutor.from(sys, name);
    await this.#runner.createModuleTemplate(mod);
    if (page && sys.type === "app")
      await this.pageScript.createCrudPage(mod, { app: sys as App, basePath: null, single: false });
    await sys.scan();
  }
  async createModule(sys: Sys, name: string, description?: string, schemaDescription?: string) {
    const session = new AiSession("createModule", { workspace: sys.workspace, cacheKey: name });
    const [appNames, libNames] = await sys.workspace.getSyss();
    const moduleConstantExampleFiles = await sys.workspace.getConstantFiles();
    const moduleDictionaryExampleFiles = await sys.workspace.getDictionaryFiles();
    //create module constant, dictionary, etc...
    const executor = ModuleExecutor.from(sys, name);
    const { constant, dictionary } = await this.#runner.createModuleTemplate(executor);
    sys.log(`Module ${name} created in ${sys.type}s/${sys.name}/lib/${name}`);

    // edit constant ✅
    const config = await sys.getConfig();
    const moduleRequest = new ModuleRequest({ sysType: sys.type, sysName: sys.name, modelName: name, config });
    const constantRequestPrompt = await moduleRequest.requestModelConstant({
      modelDesc: description ?? "",
      modelSchemaDesign: schemaDescription ?? "",
      boilerplate: constant.content,
      exampleFiles: randomPicks(moduleConstantExampleFiles, Math.min(10, moduleConstantExampleFiles.length)),
    });
    const constantContent = await session.editTypescript(constantRequestPrompt, { validate: [] });

    sys.writeFile(`lib/${name}/${name}.constant.ts`, constantContent);

    // edit dictionary ✅
    const dictionaryContent = await session.editTypescript(
      request.requestDictionary({
        sysName: sys.name,
        modelName: name,
        constant: constantContent,
        modelDesc: description ?? "",
        modelSchemaDesign: schemaDescription ?? "",
        boilerplate: dictionary.content,
        exampleFiles: randomPicks(moduleConstantExampleFiles, Math.min(10, moduleConstantExampleFiles.length)),
      })
    );
    sys.writeFile(`lib/${name}/${name}.dictionary.ts`, dictionaryContent);

    //edit View, Unit, Template
    await this.createView(executor);
    await this.createUnit(executor);
    await this.createTemplate(executor);
    sys.log(`Module ${name} created in ${sys.type}s/${sys.name}/lib/${name}`);
  }
  async createModule_(sys: Sys, name: string, description: string, schemaDescription: string) {
    const session = new AiSession("createModule", { workspace: sys.workspace, cacheKey: name });
    const [appNames, libNames] = await sys.workspace.getSyss();
    const moduleConstantExampleFiles = await sys.workspace.getConstantFiles();
    const moduleDictionaryExampleFiles = await sys.workspace.getDictionaryFiles();
    //create module constant, dictionary, etc...
    const executor = ModuleExecutor.from(sys, name);
    // const { constant, dictionary } = await this.#runner.createModuleTemplate(sys, name);
    sys.log(`Module ${name} created in ${sys.type}s/${sys.name}/lib/${name}`);

    //edit constant ✅
    // const constantContent = await session.editTypescript(
    //   request.requestConstant({
    //     sysName: sys.name,
    //     modelName: name,
    //     modelDesc: description,
    //     modelSchemaDesign: schemaDescription,
    //     boilerplate: constant.content,
    //     exampleFiles: randomPicks(moduleConstantExampleFiles, Math.min(10, moduleConstantExampleFiles.length)),
    //   })
    // );

    // sys.writeFile(`lib/car/car.constant.ts`, constantContent);

    //edit dictionary ✅
    // const dictionaryContent = await session.editTypescript(
    //   request.requestDictionary({
    //     sysName: sys.name,
    //     modelName: name,
    //     constant: constantContent,
    //     modelDesc: description,
    //     modelSchemaDesign: schemaDescription,
    //     boilerplate: dictionary.content,
    //     exampleFiles: randomPicks(moduleConstantExampleFiles, Math.min(10, moduleConstantExampleFiles.length)),
    //   })
    // );
    // sys.writeFile(`lib/car/car.dictionary.ts`, dictionaryContent);

    //edit View, Unit, Template
    await this.createView(executor);
    await this.createUnit(executor);
    await this.createTemplate(executor);
    sys.log(`Module ${name} created in ${sys.type}s/${sys.name}/lib/${name}`);
  }
  async removeModule(mod: Module) {
    await this.#runner.removeModule(mod);
  }
  async createService(workspace: Workspace, name: string) {
    //
  }
  async createTest(workspace: Workspace, name: string) {
    //
  }
  async createTemplate(mod: Module) {
    const { component: template } = await this.#runner.createComponentTemplate(mod, "template");
    const templateExampleFiles = (await mod.sys.getTemplatesSourceCode()).filter(
      (f) => !f.filePath.includes(`${mod.name}.Template.tsx`)
    );
    const Name = capitalize(mod.name);
    const relatedCnsts = getRelatedCnsts(`${mod.sys.cwdPath}/lib/${mod.name}/${mod.name}.constant.ts`);
    const constant = fs.readFileSync(`${mod.sys.cwdPath}/lib/${mod.name}/${mod.name}.constant.ts`, "utf-8");
    const session = new AiSession("createTemplate", { workspace: mod.sys.workspace, cacheKey: mod.name });
    const promptRst = request.requestTemplate({
      sysName: mod.sys.name,
      modelName: mod.name,
      ModelName: Name,
      constant: constant,
      boilerplate: template.content,
      properties: relatedCnsts.map((r) => ({ key: r.key, source: r.source })),
      exampleFiles: randomPicks(templateExampleFiles, Math.min(20, templateExampleFiles.length)),
    });
    const content = await session.editTypescript(promptRst);

    //! 파일을 {name}.View.tsx에 저장.

    mod.writeFile(`${Name}.Template.tsx`, content);
  }

  async createUnit(mod: Module) {
    const { component: unit } = await this.#runner.createComponentTemplate(mod, "unit");
    const Name = capitalize(mod.name);
    const unitExampleFiles = (await mod.sys.getUnitsSourceCode()).filter(
      (f) => !f.filePath.includes(`${mod.name}.Unit.tsx`)
    );
    const relatedCnsts = getRelatedCnsts(`${mod.sys.cwdPath}/lib/${mod.name}/${mod.name}.constant.ts`);
    const constant = fs.readFileSync(`${mod.sys.cwdPath}/lib/${mod.name}/${mod.name}.constant.ts`, "utf-8");
    const session = new AiSession("createUnit", { workspace: mod.sys.workspace, cacheKey: mod.name });

    const promptRst = request.requestUnit({
      sysName: mod.sys.name,
      modelName: mod.name,
      ModelName: Name,
      constant: constant,
      properties: relatedCnsts.map((r) => ({ key: r.key, source: r.source })),
      exampleFiles: randomPicks(unitExampleFiles, Math.min(10, unitExampleFiles.length)),
      boilerplate: unit.content,
    });

    const content = await session.editTypescript(promptRst);

    //! 파일을 {name}.Unit.tsx에 저장.

    mod.writeFile(`${Name}.Unit.tsx`, content);
  }

  async createView(mod: Module) {
    const { component: view } = await this.#runner.createComponentTemplate(mod, "view");
    const viewExampleFiles = (await mod.sys.getViewsSourceCode()).filter(
      (f) => !f.filePath.includes(`${mod.name}.View.tsx`)
    );
    const Name = capitalize(mod.name);
    const relatedCnsts = getRelatedCnsts(`${mod.sys.cwdPath}/lib/${mod.name}/${mod.name}.constant.ts`);
    const constant = fs.readFileSync(`${mod.sys.cwdPath}/lib/${mod.name}/${mod.name}.constant.ts`, "utf-8");
    const session = new AiSession("createView", { workspace: mod.sys.workspace, cacheKey: mod.name });
    const promptRst = request.requestView({
      sysName: mod.sys.name,
      modelName: mod.name,
      ModelName: Name,
      constant: constant,
      boilerplate: view.content,
      properties: relatedCnsts.map((r) => ({ key: r.key, source: r.source })),
      exampleFiles: randomPicks(viewExampleFiles, Math.min(20, viewExampleFiles.length)),
    });

    const content = await session.editTypescript(promptRst);

    //! 파일을 {name}.View.tsx에 저장.

    mod.writeFile(`${Name}.View.tsx`, content);
  }
}
// the metric of how well the person lives now.
// happiness, wealth, health, mentalHealth, and whatever you want to add to be helpful
// remove socialConnections and add personalVision
