import { describe, expect, test } from "bun:test";
import { PipelineNames } from "./PipelineNames";

describe("PipelineNames", () => {
  test("ids are lowercase, digits and dashes", () => {
    expect(PipelineNames.idError("after-build-2")).toBeNull();
    expect(PipelineNames.idError("Build")).toContain("not an id");
    expect(PipelineNames.idError("-x")).toContain("not an id");
    expect(PipelineNames.idError("a".repeat(65))).toContain("not an id");
  });

  test("secret names are uppercase and never the executor's", () => {
    expect(PipelineNames.secretNameError("DISCORD_WEBHOOK")).toBeNull();
    expect(PipelineNames.secretNameError("discord")).toContain("not a secret name");
    expect(PipelineNames.secretNameError("1TOKEN")).toContain("not a secret name");
    expect(PipelineNames.secretNameError("sk-live-51Hxyz")).not.toContain("sk-live");
    expect(PipelineNames.secretNameError("CI")).toContain("reserved");
    expect(PipelineNames.secretNameError("AKAN_CI_BRANCH")).toContain("reserved");
    expect(PipelineNames.secretNameError("AKAN_CI_SOMETHING_NEW")).toContain("reserved");
    expect(PipelineNames.secretNameError("PATH")).toContain("reserved");
    expect(PipelineNames.secretNameError("AKAN_CIRCLE")).toBeNull();
  });

  test("env names allow lowercase but share the reserved set", () => {
    expect(PipelineNames.envNameError("node_env")).toBeNull();
    expect(PipelineNames.envNameError("9LIVES")).toContain("not an environment variable name");
    expect(PipelineNames.envNameError("LD_PRELOAD")).toContain("reserved");
    expect(PipelineNames.envNameError("AKAN_CI")).toContain("reserved");
  });
});
