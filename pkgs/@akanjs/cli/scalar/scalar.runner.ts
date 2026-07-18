import { AiSession, runner, type Sys } from "@akanjs/devkit";
import { pluralizeName } from "../pluralizeName";

import { ScalarPrompt } from "./scalar.prompt";

export class ScalarRunner extends runner("scalar") {
  async applyScalarTemplate(sys: Sys, scalarName: string) {
    await sys.applyTemplate({
      basePath: "./lib/__scalar",
      template: "__scalar",
      dict: { model: scalarName, models: pluralizeName(scalarName), sysName: sys.name },
      overwrite: false,
    });
    return {
      abstract: {
        filename: `${scalarName}.abstract.md`,
        content: await sys.readFile(`lib/__scalar/${scalarName}/${scalarName}.abstract.md`),
      },
      constant: {
        filename: `${scalarName}.constant.ts`,
        content: await sys.readFile(`lib/__scalar/${scalarName}/${scalarName}.constant.ts`),
      },
      dictionary: {
        filename: `${scalarName}.dictionary.ts`,
        content: await sys.readFile(`lib/__scalar/${scalarName}/${scalarName}.dictionary.ts`),
      },
      document: {
        filename: `${scalarName}.document.ts`,
        content: await sys.readFile(`lib/__scalar/${scalarName}/${scalarName}.document.ts`),
      },
    };
  }
  async createScalarConstant(sys: Sys, scalarName: string) {
    const isContinued = await sys.exists(`lib/__scalar/${scalarName}/${scalarName}.constant.ts`);
    const prompt = new ScalarPrompt(sys, scalarName);
    const session = new AiSession("createScalar", { workspace: sys.workspace, cacheKey: scalarName, isContinued });
    const { request, validate } = session.isCacheLoaded
      ? await prompt.requestUpdateConstant()
      : await prompt.requestCreateConstant();
    const writes = await session.writeTypescripts(request, sys, { validate });
    const scalarNames = writes.map(({ filePath }) => filePath.split("/").at(-2)).filter((name) => !!name) as string[];
    if (!scalarNames.includes(scalarName)) scalarNames.unshift(scalarName);
    for (const name of scalarNames) await this.applyScalarTemplate(sys, name);
    return { session, scalarNames, writes, prompt };
  }
  async updateScalarDictionaries(sys: Sys, scalarNames: string[], { session }: { session: AiSession }) {
    const [firstScalarName, ...followingScalarNames] = scalarNames;
    const prompt = new ScalarPrompt(sys, firstScalarName);
    const { request, validate } = await prompt.requestUpdateDictonaryWithInstruction();
    await session.writeTypescripts(request, sys, { validate });
    for (const scalarName of followingScalarNames) {
      const prompt = new ScalarPrompt(sys, scalarName);
      const { request, validate } = await prompt.requestUpdateDictonaryWithFollowing();
      await session.writeTypescripts(request, sys, { validate });
    }
  }
}
