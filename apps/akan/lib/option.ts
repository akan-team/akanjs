import { AkanOption } from "akanjs/server";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {};

export const option = new AkanOption<ModulesOptions>();
