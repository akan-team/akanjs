import { afterEach, describe, expect, mock, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { Prompter } from "@akanjs/devkit/guideline/prompter";

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
});
