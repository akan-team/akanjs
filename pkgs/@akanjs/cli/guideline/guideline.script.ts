import { script } from "@akanjs/devkit/commandDecorators";
import { Prompter } from "@akanjs/devkit/guideline/prompter";
import { Logger } from "akanjs/common";

export class GuidelineScript extends script("guideline") {
  async guideline(action: string, name: string | null = null) {
    if (action === "list") {
      const guidelines = await Prompter.listGuidelines();
      Logger.rawLog(guidelines.join("\n"));
      return;
    }
    if (action === "show") {
      if (!name) throw new Error("Guideline name is required. Example: akan guideline show framework");
      Logger.rawLog(await Prompter.getInstruction(name));
      return;
    }
    throw new Error(`Unknown guideline action: ${action}. Use "list" or "show".`);
  }
}
