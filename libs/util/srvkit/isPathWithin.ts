import { resolve } from "node:path";

export const isPathWithin = (root: string, path: string) => {
  const base = resolve(root);
  return resolve(base, path).startsWith(`${base}/`);
};
