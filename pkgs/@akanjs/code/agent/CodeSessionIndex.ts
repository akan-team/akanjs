import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parseJsonLine, readJsonLines } from "./jsonLines";

export interface CodeSessionEntry {
  id: string;
  file: string;
  /** What the session calls itself, when it was named. */
  name: string | undefined;
  /** The first thing the person asked, which is what a list of sessions is actually scanned for. */
  opening: string;
  updatedAt: number;
  turns: number;
}

// Read as files: the engine's session manager has nothing that enumerates the directory.
export class CodeSessionIndex {
  static readonly readLimit = 512 * 1024;

  static list(dir: string, limit = 30): CodeSessionEntry[] {
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir)
      .filter((entry) => entry.endsWith(".jsonl"))
      .map((entry) => path.join(dir, entry))
      .map((file) => ({ file, updatedAt: CodeSessionIndex.#mtime(file) }))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, limit);
    return files
      .map((entry) => CodeSessionIndex.#read(entry.file, entry.updatedAt))
      .filter((entry): entry is CodeSessionEntry => !!entry);
  }

  static fileOf(dir: string, id: string) {
    if (!existsSync(dir)) return undefined;
    // The file name carries the id after its timestamp, so the directory is searched without reading anything.
    const match = readdirSync(dir).find((entry) => entry.endsWith(`${id}.jsonl`) || entry === `${id}.jsonl`);
    return match ? path.join(dir, match) : undefined;
  }

  static #mtime(file: string) {
    try {
      return statSync(file).mtimeMs;
    } catch {
      return 0;
    }
  }

  static #read(file: string, updatedAt: number): CodeSessionEntry | undefined {
    const lines = readJsonLines(file, CodeSessionIndex.readLimit);
    if (!lines.length) return undefined;
    const entry: CodeSessionEntry = { id: "", file, name: undefined, opening: "", updatedAt, turns: 0 };
    for (const line of lines) {
      const record = parseJsonLine<{ [key: string]: unknown; type?: string }>(line);
      if (!record) continue;
      if (record.type === "session" && typeof record.id === "string") entry.id = record.id;
      // A rename appends a second entry rather than editing the first, so the last one on the file wins.
      if (record.type === "session_info" && typeof record.name === "string") entry.name = record.name;
      if (record.type !== "message") continue;
      const message = record.message as { role?: string; content?: unknown } | undefined;
      if (message?.role !== "user") continue;
      entry.turns += 1;
      if (!entry.opening) entry.opening = CodeSessionIndex.#text(message.content);
    }
    return entry.id ? entry : undefined;
  }

  static #text(content: unknown) {
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((part) => (typeof part === "object" && part && "text" in part ? String(part.text) : ""))
              .join(" ")
          : "";
    return text.replace(/\s+/g, " ").trim();
  }
}
