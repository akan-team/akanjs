import { AiSession, type Sys } from "@akanjs/devkit";
import pluralize from "pluralize";

import { ScalarPrompt } from "./scalar.prompt";

export class ScalarRunner {
  async applyScalarTemplate(sys: Sys, scalarName: string) {
    await sys.applyTemplate({
      basePath: "./lib/__scalar",
      template: "__scalar",
      dict: { model: scalarName, models: pluralize(scalarName), sysName: sys.name },
      overwrite: false,
    });
  }
  async createScalarConstant(sys: Sys, scalarName: string) {
    const isContinued = sys.exists(`lib/__scalar/${scalarName}/${scalarName}.constant.ts`);
    const prompt = new ScalarPrompt(sys, scalarName);
    const session = new AiSession("createScalar", { workspace: sys.workspace, cacheKey: scalarName, isContinued });
    const { request, validate } = session.isCacheLoaded
      ? await prompt.requestUpdateConstant()
      : await prompt.requestCreateConstant();
    const writes = await session.writeTypescripts(request, sys, { validate });
    const scalarNames = writes.map(({ filePath }) => filePath.split("/").at(-2)).filter((name) => !!name) as string[];
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
      const { request, validate } = prompt.requestUpdateDictonaryWithFollowing();
      await session.writeTypescripts(request, sys, { validate });
    }
  }
}
