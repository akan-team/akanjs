import { type App, type Module, type Sys, script } from "@akanjs/devkit/commandDecorators";
import { ModuleExecutor } from "@akanjs/devkit/executors";
import {
  assertPlainName,
  createPassedPrimitiveReport,
  generatedFilesForSync,
  type PrimitiveWriteReport,
  sourceFile,
} from "@akanjs/devkit/workflow";
import { capitalize } from "akanjs/common";

import { PageScript } from "../page/page.script";
import { ModuleRunner } from "./module.runner";

type CreatedFileMap = Record<string, { filename: string; content: string }>;

const moduleChangedFiles = (sys: Sys, moduleName: string, files: CreatedFileMap) =>
  Object.values(files).map((file) =>
    sourceFile(sys, `lib/${moduleName}/${file.filename}`, "create", "Module source file was created."),
  );

export class ModuleScript extends script("module", [ModuleRunner, PageScript]) {
  async createModuleTemplate(
    sys: Sys,
    name: string,
    { page = false }: { page?: boolean } = {},
  ): Promise<PrimitiveWriteReport> {
    assertPlainName("module", name);
    const mod = ModuleExecutor.from(sys, name);
    const files = await this.moduleRunner.createModuleTemplate(mod);
    if (page && sys.type === "app")
      await this.pageScript.createCrudPage(mod, { app: sys as App, basePath: null, single: false });
    await sys.scan();
    return createPassedPrimitiveReport({
      command: "create-module",
      changedFiles: moduleChangedFiles(sys, name, files),
      generatedFiles: generatedFilesForSync(sys, "Generated files were refreshed after module creation."),
      target: sys.name,
    });
  }
  async removeModule(mod: Module) {
    await this.moduleRunner.removeModule(mod);
  }
  async createService(sys: Sys, name: string): Promise<PrimitiveWriteReport> {
    assertPlainName("service", name);
    const service = ModuleExecutor.from(sys, `_${name}`);
    const files = await this.moduleRunner.createService(service);
    await sys.scan();
    return createPassedPrimitiveReport({
      command: "create-service",
      changedFiles: moduleChangedFiles(sys, `_${name}`, files),
      generatedFiles: generatedFilesForSync(sys, "Generated files were refreshed after service creation."),
      target: sys.name,
    });
  }
  async createTemplate(mod: Module): Promise<PrimitiveWriteReport> {
    return await this.#createComponent(mod, "template");
  }
  async createUnit(mod: Module): Promise<PrimitiveWriteReport> {
    return await this.#createComponent(mod, "unit");
  }
  async createView(mod: Module): Promise<PrimitiveWriteReport> {
    return await this.#createComponent(mod, "view");
  }
  async #createComponent(mod: Module, type: "template" | "unit" | "view"): Promise<PrimitiveWriteReport> {
    const { component } = await this.moduleRunner.createComponentTemplate(mod, type);
    return createPassedPrimitiveReport({
      command: `create-${type}`,
      changedFiles: [
        sourceFile(
          mod.sys,
          `lib/${mod.name}/${component.filename}`,
          "create",
          `${capitalize(type)} UI source was created.`,
        ),
      ],
      target: mod.sys.name,
    });
  }
}
