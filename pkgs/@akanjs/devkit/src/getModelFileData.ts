import fs from "fs";

interface ModelFileData {
  moduleType: "lib" | "app";
  moduleName: string;
  modelName: string;
  constantFilePath: string;
  importModelNames: string[];
  hasImportScalar: boolean;
  importLibNames: string[];
  constantFileStr: string;
  unitFilePath: string;
  unitFileStr: string;
  viewFilePath: string;
  viewFileStr: string;
}

export const getModelFileData = (modulePath: string, modelName: string): ModelFileData => {
  const moduleType = modulePath.startsWith("apps") ? "app" : "lib";
  const moduleName = modulePath.split("/")[1];
  const constantFilePath = `${modulePath}/lib/${modelName}/${modelName}.constant.ts`;
  const unitFilePath = `${modulePath}/lib/${modelName}/${modelName}.Unit.tsx`;
  const viewFilePath = `${modulePath}/lib/${modelName}/${modelName}.View.tsx`;
  const constantFileStr = fs.readFileSync(constantFilePath, "utf8");
  const unitFileStr = fs.readFileSync(unitFilePath, "utf8");
  const viewFileStr = fs.readFileSync(viewFilePath, "utf8");

  const constantFileLines = constantFileStr.split("\n");
  const importLibNames = constantFileLines
    .filter((line) => line.startsWith("import { cnst as "))
    .map((line) => line.split("cnst as ")[1].split(" ")[0]);

  const importLocalPaths = constantFileLines
    .filter((line) => line.startsWith("import { ") && line.includes('from "../'))
    .map((line) => line.split("from ")[1].split('"')[1]);

  const importModelNames = importLocalPaths.map((path) => path.split("/")[1]).filter((name) => !name.startsWith("_"));

  const hasImportScalar = !!importLocalPaths.map((path) => path.split("/")[1]).filter((name) => name.startsWith("_"))
    .length;

  return {
    moduleType,
    moduleName,
    modelName,
    constantFilePath,
    unitFilePath,
    viewFilePath,
    importModelNames,
    hasImportScalar,
    importLibNames,
    constantFileStr,
    unitFileStr,
    viewFileStr,
  };
};
