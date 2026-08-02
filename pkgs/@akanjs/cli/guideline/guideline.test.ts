import { afterEach, describe, expect, mock, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { Prompter } from "@akanjs/devkit/prompter";
import { createCallRecorder, createFakeExecutor } from "../testHelpers";
import { GuidelineScript } from "./guideline.script";

afterEach(() => {
  CommandContainer.clear();
  mock.restore();
});

describe("GuidelineScript", () => {
  test("lists and loads bundled guideline instructions", async () => {
    const guidelines = await Prompter.listGuidelines();
    const framework = await Prompter.getInstruction("framework");

    expect(guidelines).toContain("framework");
    expect(framework).toContain("Akan.js Framework Guide");
  });

  test("updates instruction and document when the guide has a page", async () => {
    const script = CommandContainer.get(GuidelineScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);
    const session = { id: "session" };
    script.guidelineRunner.updateInstruction = async (...args) => {
      recorder.record("updateInstruction", ...args);
      return { guideJson: { page: { path: "docs/page.tsx" } }, session };
    };
    script.guidelineRunner.updateDocument = async (...args) => recorder.record("updateDocument", ...args);

    await script.updateInstruction(workspace as never, "testing", "make it better");

    expect(recorder.names()).toEqual(["updateInstruction", "updateDocument"]);
    expect(recorder.calls[1]?.args).toEqual([workspace, "testing", { updateRequest: "make it better", session }]);
  });

  test("skips document update when guide has no page", async () => {
    const script = CommandContainer.get(GuidelineScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);
    script.guidelineRunner.updateInstruction = async (...args) => {
      recorder.record("updateInstruction", ...args);
      return { guideJson: {}, session: { id: "session" } };
    };
    script.guidelineRunner.updateDocument = async (...args) => recorder.record("updateDocument", ...args);

    await script.updateInstruction(workspace as never, "testing", "make it better");

    expect(recorder.names()).toEqual(["updateInstruction"]);
  });

  test("delegates generate, update document, and reapply operations", async () => {
    const script = CommandContainer.get(GuidelineScript);
    const recorder = createCallRecorder();
    const workspace = createFakeExecutor("workspace", {}, recorder);
    script.guidelineRunner.generateInstruction = async (...args) => recorder.record("generateInstruction", ...args);
    script.guidelineRunner.generateDocument = async (...args) => recorder.record("generateDocument", ...args);
    script.guidelineRunner.updateDocument = async (...args) => recorder.record("updateDocument", ...args);
    script.guidelineRunner.reapplyInstruction = async (...args) => recorder.record("reapplyInstruction", ...args);

    await script.generateInstruction(workspace as never, "testing");
    await script.generateDocument(workspace as never, "testing");
    await script.updateDocument(workspace as never, "testing", {
      updateRequest: "request",
      session: { id: "session" } as never,
    });
    await script.reapplyInstruction(workspace as never, "testing");

    expect(recorder.names()).toEqual([
      "generateInstruction",
      "generateDocument",
      "updateDocument",
      "reapplyInstruction",
    ]);
  });
});
