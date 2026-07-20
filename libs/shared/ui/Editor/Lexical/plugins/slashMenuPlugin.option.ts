import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { LexicalEditor } from "lexical";

import type { SlashGroup } from "./slashMenuPlugin.type";

/** One entry in the slash menu. `keywords` widen search matching beyond the title. */
export class SlashOption extends MenuOption {
  readonly label: string;
  readonly description: string;
  readonly group: SlashGroup;
  readonly keywords: string[];
  readonly run: (editor: LexicalEditor) => void;

  constructor(
    key: string,
    config: {
      label: string;
      description: string;
      group: SlashGroup;
      keywords?: string[];
      run: (editor: LexicalEditor) => void;
    },
  ) {
    super(key);
    this.label = config.label;
    this.description = config.description;
    this.group = config.group;
    this.keywords = config.keywords ?? [];
    this.run = config.run;
  }
}
