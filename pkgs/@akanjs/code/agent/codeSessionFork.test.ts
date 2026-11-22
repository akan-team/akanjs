import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodeSessionFork } from "./CodeSessionFork";
import { CodeSessionIndex } from "./CodeSessionIndex";

const lines = (id: string) => [
  JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-09-20T14:35:32.579Z", cwd: "/repo" }),
  JSON.stringify({ type: "session_info", id: "aa", parentId: null, name: "read-the-guard" }),
  JSON.stringify({ type: "message", id: "bb", parentId: "aa", message: { role: "user", content: "who guards it" } }),
];

const seed = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "akan-fork-"));
  const id = "01a0bf3e-6563-78f4-9017-c541ca067354";
  const file = path.join(dir, `2026-09-20T14-35-32-579Z_${id}.jsonl`);
  writeFileSync(file, `${lines(id).join("\n")}\n`);
  return { dir, id, file };
};

const records = (file: string) =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !!line.trim())
    .map((line) => JSON.parse(line) as { type?: string; id?: string; name?: string });

describe("CodeSessionFork", () => {
  test("the copy carries the conversation under an id of its own", () => {
    const { dir, id, file } = seed();
    const forked = CodeSessionFork.fork(dir, id);
    expect(forked.id).not.toBe(id);
    expect(forked.file).not.toBe(file);
    const copied = records(forked.file);
    expect(copied.find((record) => record.type === "session")?.id).toBe(forked.id);
    expect(copied.filter((record) => record.type === "message").length).toBe(1);
    expect(CodeSessionIndex.fileOf(dir, forked.id)).toBe(forked.file);
    expect(CodeSessionIndex.fileOf(dir, id)).toBe(file);
  });

  test("the original is left exactly as it was", () => {
    const { dir, id, file } = seed();
    const before = readFileSync(file, "utf8");
    CodeSessionFork.fork(dir, id);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  test("the copy says it is one, and takes a name when given one", () => {
    const { dir, id } = seed();
    expect(records(CodeSessionFork.fork(dir, id).file).at(-1)?.name).toBe("read-the-guard-fork");
    expect(records(CodeSessionFork.fork(dir, id, "try the other guard").file).at(-1)?.name).toBe("try the other guard");
  });

  test("an id nothing on disk answers to is refused rather than opening a new session", () => {
    const { dir } = seed();
    expect(() => CodeSessionFork.fork(dir, "nope")).toThrow("No stored session nope");
  });
});
