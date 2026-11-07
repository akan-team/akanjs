import fsPromise from "node:fs/promises";
import { input, select } from "@inquirer/prompts";

import { ConventionSet } from "./conventionSet";
import { getDirname } from "./fileSys";

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
  // Checked against the listing, not interpolated into a path: the name is an MCP tool argument, and an unknown one
  // must not surface an ENOENT carrying the host's paths.
  static async getInstruction(guideName: string): Promise<string> {
    const guideNames = await Prompter.listGuidelines();
    if (!guideNames.includes(guideName))
      throw new Error(`Unknown guideline "${guideName}". Available: ${guideNames.join(", ")}`);
    const guidelineRoot = await Prompter.#getGuidelineRoot();
    const composed = `${guidelineRoot}/${guideName}/core.md`;
    if (await Bun.file(composed).exists())
      return (await ConventionSet.load(`${guidelineRoot}/${guideName}`)).instruction;
    return await fsPromise.readFile(`${guidelineRoot}/${guideName}/${guideName}.instruction.md`, "utf-8");
  }
  static async getConventionSet() {
    return await ConventionSet.load(`${await Prompter.#getGuidelineRoot()}/conventions`);
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
