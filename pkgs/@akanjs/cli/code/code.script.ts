import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { CodeRunner } from "./code.runner";

export interface CodeScriptOptions {
  app: string | null;
  profile: string;
  model: string | null;
  compactAt: number | null;
  json: boolean;
  thinking: boolean;
  rpc: boolean;
  rpcListen: string | null;
  interactive: boolean;
  resume: string | null;
}

export class CodeScript extends script("code", [CodeRunner]) {
  async run(workspace: Workspace, prompt: string, options: CodeScriptOptions) {
    const run = {
      workspace,
      ...(options.app ? { app: options.app } : {}),
      profile: options.profile,
      ...(options.model ? { model: options.model } : {}),
      ...(options.compactAt !== null ? { compactAt: options.compactAt } : {}),
      json: options.json,
      thinking: options.thinking,
      ...(options.resume ? { resume: options.resume } : {}),
    };
    if (options.rpcListen) return await this.codeRunner.serve(run, options.rpcListen);
    if (options.rpc) return await this.codeRunner.serve(run);
    const interactive = options.interactive || (!prompt.trim() && !options.json && !!process.stdout.isTTY);
    if (interactive) return await this.codeRunner.tui(run, prompt);
    if (!prompt.trim())
      throw new Error('akan code needs a prompt when it has no terminal: akan code "add a comment module"');
    await this.codeRunner.run(prompt, run);
  }
}
