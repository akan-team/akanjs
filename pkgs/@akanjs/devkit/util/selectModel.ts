import { readdirSync } from "node:fs";
import { select } from "@inquirer/prompts";

/** @deprecated Nothing in akanjs uses it; removed in a later minor. */
export const selectModel = async (modulePath: string) => {
  const modelNames = readdirSync(`${modulePath}/lib`).filter((dir) => !dir.includes(".") && !dir.startsWith("_"));
  return await select({
    message: "Select the model to create the unit for",
    choices: modelNames.map((name) => ({ name, value: name })),
  });
};
