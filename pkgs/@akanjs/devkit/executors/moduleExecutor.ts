import { Executor, execEmoji } from "./executor";
import type { SysExecutor } from "./sysExecutor";

interface ModuleExecutorOptions {
  sys: SysExecutor;
  name: string;
}
export class ModuleExecutor extends Executor {
  sys: SysExecutor;
  override emoji = execEmoji.module;
  constructor({ sys, name }: ModuleExecutorOptions) {
    super(name, `${sys.workspace.workspaceRoot}/${sys.type}s/${sys.name}/lib/${name}`);
    this.sys = sys;
  }
  static from(sysExecutor: SysExecutor, name: string) {
    return new ModuleExecutor({ sys: sysExecutor, name });
  }
}
