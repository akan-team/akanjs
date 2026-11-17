import { type Module, runner } from "@akanjs/devkit/commandDecorators";
import { bilingualDescriptionForField, bilingualLabelForField, moduleSourcePaths } from "@akanjs/devkit/workflow";
import { capitalize } from "akanjs/common";
import { pluralizeName } from "../pluralizeName";

const purposeByModule: Record<string, string> = {
  budget: "Budget represents planned or actual money allocated inside the app.",
  project: "Project represents a project workspace or business initiative managed by the app.",
  task: "Task represents work items that move through the app workflow.",
};

const moduleAbstractContent = (moduleName: string, sharedGuards: boolean) => {
  const title = capitalize(moduleName);
  const noun = bilingualLabelForField(moduleName).en.toLowerCase();
  const purpose = purposeByModule[moduleName] ?? `${title} represents ${noun} records managed by the app.`;
  const writeRule = sharedGuards
    ? `Anyone may read a ${noun}; only an admin creates, updates or removes one.`
    : `Anyone may read a ${noun}; nobody creates, updates or removes one until the slice names a guard.`;
  return `# ${moduleName} Abstract
${purpose}

## Rules
- ${writeRule}
- Removal is soft: a removed ${noun} keeps its row with \`removedAt\` set.
`;
};

const moduleFileKeys = [
  "abstract",
  "constant",
  "dictionary",
  "service",
  "store",
  "signal",
  "unit",
  "view",
  "template",
  "zone",
  "util",
] as const;

export class ModuleRunner extends runner("module") {
  async createService(module: Module) {
    const serviceName = module.name.replace(/^_+/, "");
    await module.applyTemplate({
      basePath: `.`,
      template: "service",
      dict: { model: serviceName, sysName: module.sys.name },
    });
    return await this.#readFiles(module, {
      abstract: `${serviceName}.abstract.md`,
      dictionary: `${serviceName}.dictionary.ts`,
      service: `${serviceName}.service.ts`,
      signal: `${serviceName}.signal.ts`,
      store: `${serviceName}.store.ts`,
    });
  }
  async #readFiles<Key extends string>(module: Module, filenames: Record<Key, string>) {
    const files = await Promise.all(
      Object.entries<string>(filenames).map(async ([key, filename]) => [
        key,
        { filename, content: await module.readFile(filename) },
      ]),
    );
    return Object.fromEntries(files) as Record<Key, { filename: string; content: string }>;
  }
  async removeModule(module: Module) {
    await module.sys.removeDir(`lib/${module.name}`);
  }
  async #hasSharedGuards(module: Module) {
    const { sys } = module;
    if (sys.type === "lib" && sys.name === "shared") return true;
    if (!(await sys.exists("lib/srv.ts"))) return false;
    return (await sys.readFile("lib/srv.ts")).includes('"@libs/shared/lib/srv"');
  }

  async createComponentTemplate(module: Module, type: "unit" | "view" | "template" | "zone" | "util") {
    const service = module.name.startsWith("_");
    const model = service ? module.name.slice(1) : module.name;
    const filename = `${capitalize(model)}.${capitalize(type)}.tsx`;
    await module.sys.applyTemplate({
      basePath: `./lib/${module.name}`,
      template: `${service ? "serviceUi" : "module"}/__Model__.${capitalize(type)}.tsx`,
      dict: { model, sysName: module.sys.name, sysType: module.sys.type },
    });
    return { component: { filename, content: await module.sys.readFile(`lib/${module.name}/${filename}`) } };
  }

  async createModuleTemplate(module: Module) {
    const names = pluralizeName(module.name);
    const modelLabel = bilingualLabelForField(module.name);
    const modelDescription = bilingualDescriptionForField(module.name);
    const paths = moduleSourcePaths(module.name);
    const filenames = Object.fromEntries(
      moduleFileKeys.map((key) => [key, paths[key].replace(`lib/${module.name}/`, "")]),
    ) as Record<(typeof moduleFileKeys)[number], string>;
    const sharedGuards = await this.#hasSharedGuards(module);
    await module.applyTemplate({
      basePath: `.`,
      template: "module",
      options: { sharedGuards },
      dict: {
        model: module.name,
        models: names,
        sysName: module.sys.name,
        sysType: module.sys.type,
        modelLabelEn: modelLabel.en,
        modelLabelKo: modelLabel.ko,
        modelDescEn: modelDescription.en,
        modelDescKo: modelDescription.ko,
      },
    });
    await module.writeFile(filenames.abstract, moduleAbstractContent(module.name, sharedGuards));
    return await this.#readFiles(module, filenames);
  }
}
