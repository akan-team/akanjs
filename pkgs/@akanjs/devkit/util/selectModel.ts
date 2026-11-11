import { readdirSync } from "node:fs";
import { select } from "@inquirer/prompts";

export const selectModel = async (modulePath: string) => {
  const modelNames = readdirSync(`${modulePath}/lib`).filter((dir) => !dir.includes(".") && !dir.startsWith("_"));
  return await select({
    message: "Select the model to create the unit for",
    choices: modelNames.map((name) => ({ name, value: name })),
  });
};
