import { AkanOption } from "akanjs/server";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  [key: string]: unknown;
};

export const option = new AkanOption<ModulesOptions>();
