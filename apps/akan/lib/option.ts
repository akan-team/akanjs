import { AkanOption } from "akanjs/server";
import type { LibOptions } from "./srv";

<<<<<<< HEAD
export type ModulesOptions = LibOptions & {
  [key: string]: unknown;
};
=======
export type ModulesOptions = LibOptions & {};
>>>>>>> 45c25fb2c70f6a97fa8a6da635e0e08cd65d4dd7

export const option = new AkanOption<ModulesOptions>();
