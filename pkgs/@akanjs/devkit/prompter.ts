import fsPromise from "node:fs/promises";
import { input, select } from "@inquirer/prompts";

import { getDirname } from "./getDirname";
import type { GuideGenerateJson } from "./guideline";

interface FileUpdateRequestProps {
  context: string;
  request: string;
}
export class Prompter {
  static async #getGuidelineRoot() {
    const dirname = getDirname(import.meta.url);
    const candidates = [`${dirname}/guidelines`, `${dirname}/../cli/guidelines`];
    for (const candidate of candidates) {
      try {
        await fsPromise.access(candidate);
        return candidate;
      } catch {
        // Try the next layout; source and bundled CLI resolve from different dirs.
      }
    }
    return candidates[0];
  }

  static async selectGuideline() {
    const guidelineRoot = await Prompter.#getGuidelineRoot();
    const guideNames = await Prompter.listGuidelines();
    return await select({
      message: "Select a guideline",
      choices: guideNames.map((name) => ({ name, value: name })),
    });
  }
  static async listGuidelines() {
    const guidelineRoot = await Prompter.#getGuidelineRoot();
    return (await fsPromise.readdir(guidelineRoot)).filter((name) => !name.startsWith("_")).sort();
  }
  static async getGuideJson(guideName: string): Promise<GuideGenerateJson> {
    const guidelineRoot = await Prompter.#getGuidelineRoot();
    const filePath = `${guidelineRoot}/${guideName}/${guideName}.generate.json`;
    const guideJson = await fsPromise.readFile(filePath, "utf-8");
    return JSON.parse(guideJson) as GuideGenerateJson;
  }
  static async getInstruction(guideName: string): Promise<string> {
    const guidelineRoot = await Prompter.#getGuidelineRoot();
    const filePath = `${guidelineRoot}/${guideName}/${guideName}.instruction.md`;
    const content = await fsPromise.readFile(filePath, "utf-8");
    return content;
  }
  static async getUpdateRequest(guideName: string) {
    return await input({
      message: `What do you want to update in ${guideName}?`,
    });
  }

  async makeTsFileUpdatePrompt({ context, request }: FileUpdateRequestProps) {
    return `You are a senior developer writing TypeScript-based programs using Akan.js, an in-house framework. Here's an overview of the Akan.js framework:
${await this.getDocumentation("framework")}
Please understand the following background information, write code that meets the requirements, verify that it satisfies the validation conditions, and return the result.

# Code Style
- Use double quotes for all string literals in TypeScript/TSX code. Do not use single quotes.

# Background Information
\`\`\`markdown
${context}
\`\`\`

# Requirements
\`\`\`markdown
${request}
\`\`\`
`;
  }
  async getDocumentation(guideName: string) {
    const guidelineRoot = await Prompter.#getGuidelineRoot();
    const filePath = `${guidelineRoot}/${guideName}/${guideName}.instruction.md`;
    const document = await fsPromise.readFile(filePath, "utf-8");
    return `\`\`\`markdown
${document}
\`\`\`
`;
  }
}
