import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { AkanQualityScanner } from "@akanjs/devkit/qualityScanner";
export class QualityRunner extends runner("quality") {
  async scan(workspace: Workspace) {
    return await new AkanQualityScanner().scan(workspace.workspaceRoot);
  }
}
