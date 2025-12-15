import { type AiSession, Prompter, type Workspace } from "@akanjs/devkit";

import { GuidelineRunner } from "./guideline.runner";

export class GuidelineScript {
  #runner = new GuidelineRunner();
  async generateInstruction(workspace: Workspace, name: string | null = null) {
    const guideName = name ?? (await Prompter.selectGuideline());
    await this.#runner.generateInstruction(workspace, guideName);
  }
  async updateInstruction(workspace: Workspace, name: string | null = null, updateRequest: string) {
    const guideName = name ?? (await Prompter.selectGuideline());
    const { guideJson, session } = await this.#runner.updateInstruction(workspace, guideName, { updateRequest });
    if (guideJson.page) await this.updateDocument(workspace, guideName, { updateRequest, session });
  }
  async generateDocument(workspace: Workspace, name: string | null = null) {
    const guideName = name ?? (await Prompter.selectGuideline());
    await this.#runner.generateDocument(workspace, guideName);
  }
  async updateDocument(
    workspace: Workspace,
    name: string | null = null,
    { updateRequest, session }: { updateRequest: string; session: AiSession }
  ) {
    const guideName = name ?? (await Prompter.selectGuideline());
    await this.#runner.updateDocument(workspace, guideName, { updateRequest, session });
  }
  async reapplyInstruction(workspace: Workspace, name: string | null = null) {
    const guideName = name ?? (await Prompter.selectGuideline());
    await this.#runner.reapplyInstruction(workspace, guideName);
  }
}
