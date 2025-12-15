import { pluralize } from "@akanjs/common";
import { type FileContent, Prompter, type Sys } from "@akanjs/devkit";
import { input } from "@inquirer/prompts";

export class ScalarPrompt extends Prompter {
  constructor(
    readonly sys: Sys,
    readonly name: string
  ) {
    super();
  }
  async requestUpdateConstant() {
    const request = await input({ message: `What do you want to change?` });
    return { request, validate: undefined };
  }
  async requestCreateConstant() {
    const constantFiles = await this.sys.getConstantFilesWithLibs();
    const description = await input({ message: "description of scalar" });
    const schemaDescription = await input({ message: "schema description of scalar" });
    await this.sys.applyTemplate({
      basePath: "./lib/__scalar",
      template: "__scalar",
      dict: { model: this.name, models: pluralize(this.name), sysName: this.sys.name },
    });
    const boilerplate = this.sys.readFile(`lib/__scalar/${this.name}/${this.name}.constant.ts`);
    return await this.#requestConstant({
      modelDesc: description,
      modelSchemaDesign: schemaDescription,
      boilerplate,
      constantFiles,
    });
  }
  async #requestConstant({
    modelDesc,
    modelSchemaDesign,
    boilerplate,
    constantFiles,
  }: {
    modelDesc: string;
    modelSchemaDesign: string;
    boilerplate: string;
    constantFiles: FileContent[];
  }): Promise<{ request: string; validate: string[] }> {
    const scanInfo = await this.sys.scan();
    const guideJson = await Prompter.getGuideJson("scalarConstant");
    const request = await this.makeTsFileUpdatePrompt({
      context: `
1. Overview of __scalar/<model>/<model>.constant.ts file
${await this.getDocumentation("scalarConstant")}

2. How to write Enums in __scalar/<model>/<model>.constant.ts file
${await this.getDocumentation("enumConstant")}

3. How to write Fields in __scalar/<model>/<model>.constant.ts file
${await this.getDocumentation("fieldDecorator")}

4. List of constant.ts files in other libraries connected to current ${this.sys.name} ${this.sys.type === "app" ? "Application" : "Library"} ${scanInfo
        .getLibs()
        .map((lib) => lib)
        .join(", ")}
Please understand the content and file patterns below, and feel free to reuse any constants or enums if available.
${constantFiles
  .map(
    (constant) => `
\`\`\`typescript
// File: ${constant.filePath}
${constant.content}
\`\`\`
`
  )
  .join("\n")}
		`,
      request: `
Based on the above content, please organize it according to the boilerplate below for easy parsing

Application name: ${this.sys.name} (${this.sys.type === "app" ? "Application" : "Library"})
Model name: ${this.name}
Model description: ${modelDesc}
Model schema design: ${modelSchemaDesign}
Model filename(You can create another connected scalar model file if needed): ${this.name}.constant.ts
\`\`\`typescript
// File: lib/__scalar/${this.name}/${this.name}.constant.ts
${boilerplate}
\`\`\`

If additional connected scalar models need to be written besides ${this.name}.constant.ts file, please write them in the following format
\`\`\`typescript
// File: lib/__scalar/otherModel/otherModel.constant.ts
...file content
\`\`\`

Please provide only the file results without any other content.`,
    });
    return { request, validate: guideJson.update.rules };
  }
  async requestUpdateDictonaryWithInstruction() {
    const constant = this.sys.readFile(`lib/__scalar/${this.name}/${this.name}.constant.ts`);
    const boilerplate = this.sys.readFile(`lib/__scalar/${this.name}/${this.name}.dictionary.ts`);
    const guideJson = await Prompter.getGuideJson("scalarDictionary");
    const request = `다음 ${this.name}.dictionary.ts 파일도 완성된 ${this.name}.constant.ts 파일을 기반으로 작성해줘.
1. Dictionary 작성법
${await this.getDocumentation("scalarDictionary")}

Model constant file
\`\`\`typescript
// File: lib/__scalar/${this.name}/${this.name}.constant.ts
${constant}
\`\`\`

Model filename: ${this.name}.dictionary.ts
\`\`\`typescript
// File: lib/__scalar/${this.name}/${this.name}.dictionary.ts
${boilerplate}
\`\`\`
  `;
    return { request, validate: guideJson.update.rules };
  }
  requestUpdateDictonaryWithFollowing() {
    const constant = this.sys.readFile(`lib/__scalar/${this.name}/${this.name}.constant.ts`);
    const boilerplate = this.sys.readFile(`lib/__scalar/${this.name}/${this.name}.dictionary.ts`);
    const request = `다음 ${this.name}.dictionary.ts 파일도 완성된 ${this.name}.constant.ts 파일을 기반으로 작성해줘.
Model constant file
\`\`\`typescript
// File: lib/__scalar/${this.name}/${this.name}.constant.ts
${constant}
\`\`\`

Model filename: ${this.name}.dictionary.ts
\`\`\`typescript
// File: lib/__scalar/${this.name}/${this.name}.dictionary.ts
${boilerplate}
\`\`\`
  `;
    return { request, validate: [] as string[] };
  }
}
