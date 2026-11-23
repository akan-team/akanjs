import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";

const readHead = (file: string, maxBytes: number) => {
  const fd = openSync(file, "r");
  try {
    const head = Buffer.alloc(maxBytes);
    return head.subarray(0, readSync(fd, head, 0, maxBytes, 0)).toString("utf8");
  } finally {
    closeSync(fd);
  }
};

export const readJsonLines = (file: string, maxBytes?: number) => {
  try {
    const text =
      maxBytes !== undefined && statSync(file).size > maxBytes ? readHead(file, maxBytes) : readFileSync(file, "utf8");
    return text.split("\n").filter((line) => !!line.trim());
  } catch {
    return [];
  }
};

export const parseJsonLine = <T>(line: string) => {
  try {
    return JSON.parse(line) as T;
  } catch {
    return undefined;
  }
};
