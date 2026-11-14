import { readdir } from "node:fs/promises";
import { FileSys } from "../util/fileSys";

export const safeReadDir = async (dirPath: string) =>
  (await readdir(dirPath, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name));

export const safeReadText = (filePath: string) => FileSys.readText(filePath).catch(() => null);

export const safeReadJson = <T>(filePath: string) => FileSys.readJson<T>(filePath).catch(() => null);
