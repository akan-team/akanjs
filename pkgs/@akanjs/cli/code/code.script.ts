import type { AkanCodeStartOptions } from "@akanjs/code/host";
import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { CodeRunner } from "./code.runner";

export class CodeScript extends script("code", [CodeRunner]) {
  async run(workspace: Workspace, prompt: string, options: AkanCodeStartOptions) {
    await this.codeRunner.start(workspace, prompt, options);
  }
}
