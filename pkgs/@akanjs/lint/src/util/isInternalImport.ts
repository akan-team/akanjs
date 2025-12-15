import * as fs from "fs";

const projectRoot = process.cwd();
const hasLibs = fs.existsSync(`${projectRoot}/libs`);
const hasPkgs = fs.existsSync(`${projectRoot}/pkgs`);
const libNames = hasLibs ? fs.readdirSync(`${projectRoot}/libs`) : [];
const pkgsNames = hasPkgs ? fs.readdirSync(`${projectRoot}/pkgs`) : [];
const importNames = [...libNames, ...pkgsNames];
const internalImportSet = new Set([
  ...importNames.map((libName) => `@${libName}`),
  "react-icons",
  "react",
  "next",
  "@radix-ui",
  "@playwright",
  "@akanjs",
  ".",
  "..",
]);
export const isInternalImport = (importPaths: string[], appName: string | null) => {
  if (internalImportSet.has(importPaths[0])) return true;
  else if (importPaths[0] === appName) return true;
  else return false;
};
