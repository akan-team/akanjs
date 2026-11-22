import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { codeAgentSessionName } from "akanjs/common";
import { CodeSessionIndex } from "./CodeSessionIndex";
import { parseJsonLine } from "./jsonLines";

interface CodeSessionRecord {
  [key: string]: unknown;
  type?: string;
  id?: string;
}

// Only the `session` record's id is rewritten: a shared id would give two agents one inbox and one resume target.
export class CodeSessionFork {
  static fork(dir: string, id: string, name?: string) {
    const source = CodeSessionIndex.fileOf(dir, id);
    if (!source) throw new Error(`No stored session ${id} in ${dir}`);
    const lines = readFileSync(source, "utf8")
      .split("\n")
      .filter((line) => !!line.trim());
    if (!lines.length) throw new Error(`Session ${id} has nothing in it to fork`);
    const at = new Date();
    const forked = Bun.randomUUIDv7();
    const records = lines
      .map((line) => parseJsonLine<CodeSessionRecord>(line))
      .filter((record): record is CodeSessionRecord => !!record);
    const first = records.find((record) => record.type === "session");
    if (!first) throw new Error(`Session ${id} carries no session record`);
    first.id = forked;
    first.timestamp = at.toISOString();
    records.push(CodeSessionFork.#named(records, name ?? CodeSessionFork.#nameOf(records), at));
    // The engine's own file-name shape, which `CodeSessionIndex.fileOf` matches a resume against.
    const file = path.join(dir, `${at.toISOString().replace(/[:.]/g, "-")}_${forked}.jsonl`);
    writeFileSync(file, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
    return { id: forked, file };
  }

  /** A rename is an appended record, so the fork is named by adding one rather than by editing the original. */
  static #named(records: CodeSessionRecord[], name: string, at: Date) {
    const parent = records.at(-1)?.id;
    return {
      type: "session_info",
      id: randomBytes(4).toString("hex"),
      parentId: typeof parent === "string" ? parent : null,
      timestamp: at.toISOString(),
      name,
    };
  }

  static #nameOf(records: CodeSessionRecord[]) {
    const named = records.filter((record) => record.type === "session_info").at(-1);
    const current = typeof named?.name === "string" ? named.name : "";
    return codeAgentSessionName(current ? `${current} fork` : "fork");
  }
}
