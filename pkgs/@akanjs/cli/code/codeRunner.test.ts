import { describe, expect, test } from "bun:test";
import { ContextRunner } from "../context/context.runner";
import { CodeRunner } from "./code.runner";

describe("CodeRunner.host", () => {
  test("hands @akanjs/code the akan MCP catalogue, tool for tool", async () => {
    const listed = await CodeRunner.host().catalog.list("readonly");
    expect(listed.map((tool) => tool.name)).toEqual(
      new ContextRunner().listMcpTools("readonly").map((tool) => tool.name),
    );
    expect(listed.length).toBeGreaterThan(5);
  });
});
