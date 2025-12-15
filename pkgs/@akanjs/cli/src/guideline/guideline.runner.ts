import { AiSession, Prompter, type Workspace } from "@akanjs/devkit";

import { GuidelinePrompt } from "./guideline.prompt";

export class GuidelineRunner {
  async generateInstruction(workspace: Workspace, guideName: string) {
    const session = new AiSession("generateInstruction", { workspace, cacheKey: guideName });
    const prompt = new GuidelinePrompt(workspace, guideName);
    const { guideJson, request, writePath } = await prompt.requestCreateInstruction();
    const guidelineContent = await session.editMarkdown(request);
    workspace.writeFile(writePath, guidelineContent);
    return { guideJson, session };
  }
  async updateInstruction(workspace: Workspace, guideName: string, { updateRequest }: { updateRequest: string }) {
    const session = new AiSession("updateInstruction", { workspace, cacheKey: guideName });
    const prompt = new GuidelinePrompt(workspace, guideName);
    const { guideJson, request, writePath } = await prompt.requestUpdateInstruction(updateRequest);
    const guidelineContent = await session.editMarkdown(request);
    workspace.writeFile(writePath, guidelineContent);
    return { guideJson, session };
  }

  async generateDocument(workspace: Workspace, guideName: string) {
    const session = new AiSession("deployDocPages", { workspace, cacheKey: guideName });
    const guideJson = await Prompter.getGuideJson(guideName);
    const prompt = new GuidelinePrompt(workspace, guideName);
    if (!guideJson.page) return Promise.resolve({});
    const { request } = await prompt.requestCreateDocumentPage(guideJson.page);
    await session.writeTypescripts(request, workspace);
  }

  async updateDocument(
    workspace: Workspace,
    guideName: string,
    { updateRequest, session }: { updateRequest: string; session: AiSession }
  ) {
    const guideJson = await Prompter.getGuideJson(guideName);
    if (!guideJson.page) throw new Error(`${guideName} does not have a page.`);
    const prompt = new GuidelinePrompt(workspace, guideName);
    const { request, writePath } = await prompt.requestUpdateDocumentPage(guideJson.page, updateRequest);
    const guidelineContent = await session.editMarkdown(request);
    workspace.writeFile(writePath, guidelineContent);
  }

  async reapplyInstruction(workspace: Workspace, guideName: string) {
    const session = new AiSession("reapplyInstruction", { workspace, cacheKey: guideName });
    const guideJson = await Prompter.getGuideJson(guideName);
    const prompt = new GuidelinePrompt(workspace, guideName);
    const { request, writePath } = await prompt.requestReapplyInstruction(guideJson.update.filePath);
    const guidelineContent = await session.editMarkdown(request);
    workspace.writeFile(writePath, guidelineContent);
  }
}
