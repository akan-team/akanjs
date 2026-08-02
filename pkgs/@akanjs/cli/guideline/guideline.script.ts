import type { AiSession } from "@akanjs/devkit/aiEditor";
import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { Prompter } from "@akanjs/devkit/prompter";
import { Logger } from "akanjs/common";

import { GuidelineRunner } from "./guideline.runner";

export class GuidelineScript extends script("guideline", [GuidelineRunner]) {
  async guideline(action: string, name: string | null = null, format: "markdown" | "json" = "markdown") {
    if (action === "list") {
      const guidelines = await Prompter.listGuidelines();
      Logger.rawLog(format === "json" ? JSON.stringify({ guidelines }, null, 2) : guidelines.join("\n"));
      return;
    }
    if (action === "show") {
      if (!name) throw new Error("Guideline name is required. Example: akan guideline show framework");
      const [instruction, guideJson] = await Promise.all([Prompter.getInstruction(name), Prompter.getGuideJson(name)]);
      Logger.rawLog(format === "json" ? JSON.stringify({ name, instruction, guideJson }, null, 2) : instruction);
      return;
    }
    throw new Error(`Unknown guideline action: ${action}. Use "list" or "show".`);
  }
  async generateInstruction(workspace: Workspace, name: string | null = null) {
    const guideName = name ?? (await Prompter.selectGuideline());
    await this.guidelineRunner.generateInstruction(workspace, guideName);
  }
  async updateInstruction(workspace: Workspace, name: string | null = null, updateRequest: string) {
    const guideName = name ?? (await Prompter.selectGuideline());
    const { guideJson, session } = await this.guidelineRunner.updateInstruction(workspace, guideName, {
      updateRequest,
    });
    if (guideJson.page) await this.updateDocument(workspace, guideName, { updateRequest, session });
  }
  async generateDocument(workspace: Workspace, name: string | null = null) {
    const guideName = name ?? (await Prompter.selectGuideline());
    await this.guidelineRunner.generateDocument(workspace, guideName);
  }
  async updateDocument(
    workspace: Workspace,
    name: string | null = null,
    { updateRequest, session }: { updateRequest: string; session: AiSession },
  ) {
    const guideName = name ?? (await Prompter.selectGuideline());
    await this.guidelineRunner.updateDocument(workspace, guideName, { updateRequest, session });
  }
  async reapplyInstruction(workspace: Workspace, name: string | null = null) {
    const guideName = name ?? (await Prompter.selectGuideline());
    await this.guidelineRunner.reapplyInstruction(workspace, guideName);
  }
}
