import { AkanQualityScanner, runner, type Workspace } from "@akanjs/devkit";

export class QualityRunner extends runner("quality") {
  async scan(workspace: Workspace) {
    return await new AkanQualityScanner().scan(workspace.workspaceRoot);
  }
}
