import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodeAgentSuspended } from "./CodeAgentSuspended";

const dir = mkdtempSync(path.join(tmpdir(), "akan-suspended-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const question = {
  questionId: "qx.1",
  prompt: "Which app?",
  kind: "select" as const,
  options: [{ key: "a", label: "akan" }],
};
const approval = {
  approvalId: "ax.2",
  toolCallId: "c1",
  name: "write",
  summary: "write a.ts",
  policy: "writes" as const,
};

describe("CodeAgentSuspended", () => {
  test("a restarted worker reads back what it was waiting on, and each ask is taken once", () => {
    const file = CodeAgentSuspended.fileOf(dir, "s1");
    const before = new CodeAgentSuspended(file);
    before.setQuestion(question);
    before.addApproval(approval);

    const after = new CodeAgentSuspended(file);
    expect(after.question).toEqual(question);
    expect(after.approvals).toEqual([approval]);
    expect(after.takeQuestion("qx.1")).toEqual(question);
    expect(after.takeQuestion("qx.1")).toBeUndefined();
    expect(after.takeApproval("ax.2")).toEqual(approval);
    expect(after.takeApproval("ax.2")).toBeUndefined();
    expect(existsSync(file ?? "")).toBe(false);
  });

  test("a memory session keeps its asks without touching disk", () => {
    const memory = new CodeAgentSuspended(CodeAgentSuspended.fileOf(undefined, "s2"));
    memory.setQuestion(question);
    expect(memory.takeQuestion("other")).toBeUndefined();
    expect(memory.takeQuestion("qx.1")).toEqual(question);
  });
});
