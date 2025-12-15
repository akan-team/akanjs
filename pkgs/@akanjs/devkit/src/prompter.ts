import { input, select } from "@inquirer/prompts";
import fsPromise from "fs/promises";

import { getDirname } from "./getDirname";
import type { GuideGenerateJson } from "./guideline";

interface FileUpdateRequestProps {
  context: string;
  request: string;
}
export class Prompter {
  static async selectGuideline() {
    const guideNames = (await fsPromise.readdir(`${getDirname(import.meta.url)}/src/guidelines`)).filter(
      (name) => !name.startsWith("_")
    );
    return await select({ message: "Select a guideline", choices: guideNames.map((name) => ({ name, value: name })) });
  }
  static async getGuideJson(guideName: string): Promise<GuideGenerateJson> {
    const filePath = `${getDirname(import.meta.url)}/src/guidelines/${guideName}/${guideName}.generate.json`;
    const guideJson = await fsPromise.readFile(filePath, "utf-8");
    return JSON.parse(guideJson) as GuideGenerateJson;
  }
  static async getInstruction(guideName: string): Promise<string> {
    const filePath = `${getDirname(import.meta.url)}/src/guidelines/${guideName}/${guideName}.instruction.md`;
    const content = await fsPromise.readFile(filePath, "utf-8");
    return content;
  }
  static async getUpdateRequest(guideName: string) {
    return await input({ message: `What do you want to update in ${guideName}?` });
  }

  async makeTsFileUpdatePrompt({ context, request }: FileUpdateRequestProps) {
    return `You are a senior developer writing TypeScript-based programs using Akan.js, an in-house framework. Here's an overview of the Akan.js framework:
${await this.getDocumentation("framework")}
Please understand the following background information, write code that meets the requirements, verify that it satisfies the validation conditions, and return the result.

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
    const filePath = `${getDirname(import.meta.url)}/src/guidelines/${guideName}/${guideName}.instruction.md`;
    const document = await fsPromise.readFile(filePath, "utf-8");
    return `\`\`\`markdown
${document}
\`\`\`
`;
  }
}
