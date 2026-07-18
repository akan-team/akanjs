import path from "node:path";
import { fileURLToPath } from "node:url";

export const getDirname = (url: string) => path.dirname(fileURLToPath(url));
