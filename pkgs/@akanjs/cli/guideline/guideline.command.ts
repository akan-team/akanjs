import { command } from "@akanjs/devkit/commandDecorators";
import { GuidelineScript } from "./guideline.script";

export class GuidelineCommand extends command("guideline", [GuidelineScript], ({ public: target }) => ({
  guideline: target({ desc: "List or show Akan AI guideline instructions", readOnly: true })
    .arg("action", String, { desc: "list or show" })
    .arg("name", String, { desc: "guideline name for show", nullable: true })
    .exec(async function (action, name) {
      await this.guidelineScript.guideline(action, name);
    }),
})) {}
