import { randomPicks } from "@akanjs/common";
import { type FileContent, getDirname, type GuideScan, Prompter, type Workspace } from "@akanjs/devkit";
import fs from "fs";
import fsPromise from "fs/promises";

export class GuidelinePrompt extends Prompter {
  constructor(
    readonly workspace: Workspace,
    readonly name: string
  ) {
    super();
  }
  async #getScanFilePaths(
    matchPattern: string,
    { avoidDirs = ["node_modules", ".next"], filterText }: { avoidDirs?: string[]; filterText?: string } = {}
  ): Promise<string[]> {
    const matchingPaths = fsPromise.glob(matchPattern, {
      cwd: this.workspace.workspaceRoot,
      exclude: (path) => avoidDirs.some((dir) => path.includes(dir)),
    });
    const paths: string[] = [];
    for await (const path of matchingPaths) {
      const fileContent = fs.readFileSync(path, "utf-8");
      const textFilter = filterText ? new RegExp(filterText) : null;
      if (filterText && !textFilter?.test(fileContent)) continue;
      paths.push(path);
    }
    return paths;
  }
  async requestCreateInstruction() {
    const guideJson = await Prompter.getGuideJson(this.name);
    const scanFiles: (GuideScan & FileContent)[] = [];
    for (const scan of guideJson.scans) {
      const scanFilePaths = await this.#getScanFilePaths(scan.path, { filterText: scan.filterText });
      const targetFilePaths = scan.sample ? randomPicks(scanFilePaths, scan.sample) : scanFilePaths;
      const scanResult = targetFilePaths.map((filePath) => ({ ...scan, ...this.workspace.getLocalFile(filePath) }));
      scanFiles.push(...scanResult);
    }
    const resultPath = `${getDirname(import.meta.url)}/src/guidelines/${this.name}/${guideJson.update.filePath}`;
    const writePath = `${this.workspace.workspaceRoot}/pkgs/@akanjs/cli/src/guidelines/${this.name}/${guideJson.update.filePath}`;
    const isResultExists = this.workspace.exists(writePath);
    const existingResult = isResultExists ? this.workspace.readFile(resultPath) : null;
    const request = `
I am a developer of akanjs framework, a full-stack framework for building web applications.
I want to generate a ${guideJson.update.filePath} file for ${guideJson.description}.
This file is a programming guideline for Akan.js framwork users.

# ${guideJson.title} Workflow
- 1. Explore target files in ${guideJson.scans.map((scan) => scan.path).join(", ")}.
- 2. Read already-written ${guideJson.update.filePath} file if exists. There can be some outdated information, so you need to update the file and add new information, make it more accurate and more detailed.
- 3. Write the updated file content of the ${guideJson.update.filePath}. It should include the contents of ${guideJson.update.contents.join(",")}, and any other helpful information and contents for guiding.  Also, you can rearrange the contents if you think it's more helpful.

## 1. Explore target files in ${guideJson.scans.map((scan) => scan.path).join(", ")}.
${scanFiles
  .map(
    ({ type, description, filePath, content, sample }) => `
\`\`\`${filePath.endsWith(".tsx") ? "tsx" : "typescript"}
// File: ${filePath}
// Type: ${type}${sample ? " (sample)" : ""}
// Desc: ${description}
${content}
\`\`\`
`
  )
  .join("\n")}

## 2. Read already-written ${guideJson.update.filePath} file if exists. There can be some outdated information, so you need to update the file and add new information, make it more accurate and more detailed.
${
  existingResult
    ? `\`\`\`markdown
${existingResult}
\`\`\``
    : "- No existing guideline file."
}

## 3. Write the updated file content of the ${guideJson.update.filePath}. It should include the contents of ${guideJson.update.contents.join(",")}, and any other helpful information and contents for guiding. Also, you can rearrange the contents if you think it's more helpful.

Here's the last rules for writing the file content:
${guideJson.update.rules.map((rule) => `- ${rule}`).join("\n")}

=> Now, you need to write the file content here. Let's go.
`;
    return { guideJson, request, writePath };
  }
  async requestUpdateInstruction(updateRequest: string) {
    const guideJson = await Prompter.getGuideJson(this.name);
    const resultPath = `${getDirname(import.meta.url)}/src/guidelines/${this.name}/${guideJson.update.filePath}`;
    const writePath = `${this.workspace.workspaceRoot}/pkgs/@akanjs/cli/src/guidelines/${this.name}/${guideJson.update.filePath}`;
    const isResultExists = this.workspace.exists(writePath);
    if (!isResultExists) throw new Error(`${guideJson.update.filePath} file does not exist. Please create it first.`);
    const existingResult = this.workspace.readFile(resultPath);
    const request = `
I am a developer of akanjs framework, a full-stack framework for building web applications.
I want to update a ${guideJson.update.filePath} file for ${guideJson.description}.
This file is a programming guideline for Akan.js framwork users.

# ${guideJson.title} Workflow
- 1. Read already-written ${guideJson.update.filePath} file.
- 2. Write the updated file content of the ${guideJson.update.filePath} with the update request.

## 1. Read already-written ${guideJson.update.filePath} file.
\`\`\`markdown
${existingResult}
\`\`\`

## 2. Write the updated file content of the ${guideJson.update.filePath} with the update request.
Request: ${updateRequest}

=> Now, you need to write the file content here. Let's go.
`;
    return { guideJson, request, writePath };
  }
  async requestCreateDocumentPage(page: string) {
    const writePath = `apps/angelo/app${page}`;
    if (!this.workspace.exists(writePath))
      this.workspace.writeFile(
        writePath,
        `export default function Page() {
  return <div>No Content</div>;
}
`
      );
    const instruction = await Prompter.getInstruction(this.name);
    const pageContent = this.workspace.getLocalFile(writePath);
    const request = `
I'm creating a documentation website for the Akan.js framework.

1. Overview of the Akan.js framework
${await this.getDocumentation("framework")}

2. Documentation page writing method
${await this.getDocumentation("docPageRule")}

3. CSS rule with TailwindCSS and DaisyUI
${await this.getDocumentation("cssRule")}

I want to update the Next.js server-side page located at ${writePath}.
Below is the content of the currently written page.
\`\`\`tsx
// File: ${writePath}
${pageContent.content}
\`\`\`

Please update this page with the latest content below. A great design application is needed.
${instruction}

Please follow these CSS rules when writing:
- Use tailwindcss
- Use className from the daisyui library

Please return only the file result in the following format for easy parsing.
\`\`\`tsx
// File: ${writePath}
...pageContent
\`\`\`
`;
    return { request, writePath };
  }
  async requestUpdateDocumentPage(page: string, updateRequest: string) {
    const writePath = `apps/angelo/app${page}`;
    if (!this.workspace.exists(writePath))
      this.workspace.writeFile(
        writePath,
        `export default function Page() {
  return <div>No Content</div>;
}
`
      );
    const instruction = await Prompter.getInstruction(this.name);
    const pageContent = this.workspace.getLocalFile(writePath);
    const request = `
I'm updating a documentation website for the Akan.js framework.

I want to update the Next.js server-side page located at ${writePath}.
Below is the content of the currently written page. You should update stale infos and preserve the existing content.
\`\`\`tsx
// File: ${writePath}
${pageContent.content}
\`\`\`

The existing instruction is below.
\`\`\`markdown
${instruction}
\`\`\`

Please update this page with the request below.
${updateRequest}

Please return only the file result in the following format for easy parsing.
\`\`\`tsx
// File: ${writePath}
...pageContent
\`\`\`
`;
    return { request, writePath };
  }
  async requestReapplyInstruction(filePath: string) {
    const guideJson = await Prompter.getGuideJson(this.name);
    const writePath = `${this.workspace.workspaceRoot}/pkgs/@akanjs/cli/src/guidelines/${this.name}/${guideJson.update.filePath}`;
    if (!guideJson.page) throw new Error(`${this.name} does not have a page.`);
    const pagePath = `apps/angelo/app${guideJson.page}`;
    const pageFile = this.workspace.getLocalFile(pagePath);

    const request = `
I want to apply information in the Next.js page to markdown instruction file.

Here's the newest information in the Next.js page.
\`\`\`tsx
// File: ${pagePath}
${pageFile.content}
\`\`\`

Here's the existing instruction file.
\`\`\`markdown
${await Prompter.getInstruction(this.name)}
\`\`\`

Please update the instruction file with the information in the Next.js page.
`;
    return { request, writePath };
  }
}
