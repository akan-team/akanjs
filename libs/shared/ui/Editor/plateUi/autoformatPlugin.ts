import { AutoformatPlugin } from "@udecode/plate-autoformat";
import { PlatePlugin } from "@udecode/plate-common";

import { autoformatRules } from "./autoformatRules";

export const autoformatPlugin: Partial<PlatePlugin<AutoformatPlugin>> = {
  options: {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    rules: autoformatRules as any,
    enableUndoOnDelete: true,
  },
};
