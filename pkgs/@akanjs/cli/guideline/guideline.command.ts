import { command, Workspace } from "@akanjs/devkit";

import { GuidelineScript } from "./guideline.script";

export class GuidelineCommand extends command("guideline", [GuidelineScript], ({ public: target }) => ({
  guideline: target({ desc: "List or show Akan AI guideline instructions" })
    .arg("action", String, { desc: "list or show" })
    .arg("name", String, { desc: "guideline name for show", nullable: true })
    .option("format", String, {
      desc: "output format",
      default: "markdown",
      enum: ["markdown", "json"],
    })
    .exec(async function (action, name, format) {
      await this.guidelineScript.guideline(action, name, format as "markdown" | "json");
    }),
  generateInstruction: target({ devOnly: true, desc: "Generate AI development guideline/instruction for your project" })
    .arg("name", String, { ask: "name of the instruction", nullable: true })
    .with(Workspace)
    .exec(async function (name, workspace) {
      await this.guidelineScript.generateInstruction(workspace, name);
    }),
  updateInstruction: target({ devOnly: true, desc: "Update existing AI guideline/instruction" })
    .arg("name", String, { ask: "name of the instruction", nullable: true })
    .option("request", String, { ask: "What do you want to update?" })
    .with(Workspace)
    .exec(async function (name, request, workspace) {
      await this.guidelineScript.updateInstruction(workspace, name, request);
    }),
  generateDocument: target({ devOnly: true, desc: "Generate documentation from guideline/instruction" })
    .arg("name", String, { ask: "name of the instruction", nullable: true })
    .with(Workspace)
    .exec(async function (name, workspace) {
      await this.guidelineScript.generateDocument(workspace, name);
    }),
  reapplyInstruction: target({ devOnly: true, desc: "Re-apply guideline/instruction to codebase" })
    .arg("name", String, { ask: "name of the instruction", nullable: true })
    .with(Workspace)
    .exec(async function (name, workspace) {
      await this.guidelineScript.reapplyInstruction(workspace, name);
    }),
})) {}
