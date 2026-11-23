import type { AkanCodeHost, AkanCodeStartOptions } from "@akanjs/code/host";
import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import type { ContextRunner } from "../context/context.runner";
import { openBrowser } from "../openBrowser";
import { CodePackage } from "./codePackage";

export class CodeRunner extends runner("code") {
  async start(workspace: Workspace, prompt: string, options: AkanCodeStartOptions) {
    //? An RPC host owns stdin and stdout, and --json promises stdout holds only JSON.
    const ask = !options.rpc && !options.rpcListen && !options.json && !!process.stdin.isTTY && !!process.stdout.isTTY;
    const version = process.env.AKAN_VERSION ?? "";
    const { AkanCodeRunner } = await CodePackage.load(workspace, { version, ask });
    await new AkanCodeRunner(CodeRunner.host()).start(workspace, prompt, options);
  }

  static host(): AkanCodeHost {
    let context: Promise<ContextRunner> | undefined;
    const contextRunner = () =>
      (context ??= import("../context/context.runner").then(({ ContextRunner }) => new ContextRunner()));
    return {
      catalog: {
        list: async (mode) =>
          (await contextRunner()).listMcpTools(mode, { guidelineNames: await CodeRunner.#guidelineNames() }),
        call: async (workspace, name, args, mode) =>
          await (await contextRunner()).callMcpTool(workspace, name, args, { mode }),
      },
      openBrowser: (url) => void openBrowser(url),
    };
  }

  static async #guidelineNames() {
    try {
      const { Prompter } = await import("@akanjs/devkit/guideline/prompter");
      return await Prompter.listGuidelines();
    } catch {
      return [];
    }
  }
}
