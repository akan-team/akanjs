import { select } from "@inquirer/prompts";
import fs from "fs";

export const selectModel = async (modulePath: string) => {
  const modelNames = fs.readdirSync(`${modulePath}/lib`).filter((dir) => !dir.includes(".") && !dir.startsWith("_"));
  const modelName = await select({
    message: "Select the model to create the unit for",
    choices: modelNames.map((name) => ({ name, value: name })),
  });
  return modelName;
};
