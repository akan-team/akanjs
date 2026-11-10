import { AkanLibConfig } from "../akanConfig";
import { Executor, execEmoji } from "./executor";
import { type NamedExecutorOptions, SysExecutor } from "./sysExecutor";
import { WorkspaceExecutor } from "./workspaceExecutor";

export class LibExecutor extends SysExecutor {
  dist: Executor;
  override emoji = execEmoji.lib;
  constructor({ workspace, name }: NamedExecutorOptions) {
    super({ workspace, name, type: "lib" });
    this.dist = new Executor(`dist/${name}`, `${this.workspace.workspaceRoot}/dist/libs/${name}`);
  }
  static from(executor: SysExecutor | WorkspaceExecutor, name: string) {
    return new LibExecutor({ workspace: executor instanceof WorkspaceExecutor ? executor : executor.workspace, name });
  }

  #akanConfig: AkanLibConfig | null = null;
  override async getConfig({ refresh }: { refresh?: boolean } = {}) {
    if (this.#akanConfig && !refresh) return this.#akanConfig;
    this.#akanConfig = await AkanLibConfig.from(this, { bustImportCache: refresh });
    return this.#akanConfig;
  }
}
