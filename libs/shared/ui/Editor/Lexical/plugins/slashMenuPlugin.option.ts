import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { LexicalEditor } from "lexical";

import type { EditorFeatureKey } from "../feature";
import type { EditorSlashGroup } from "../plugin";

/** One entry in the slash menu. `keywords` widen search matching beyond the title. */
export class SlashOption extends MenuOption {
  readonly label: string;
  readonly description: string;
  readonly group: EditorSlashGroup;
  readonly keywords: string[];
  /** The editor feature this inserts. Absent leaves the entry always available — the paragraph reset, and every plugin entry. */
  readonly feature?: EditorFeatureKey;
  readonly run: (editor: LexicalEditor) => void;

  constructor(
    key: string,
    config: {
      label: string;
      description: string;
      group: EditorSlashGroup;
      keywords?: string[];
      feature?: EditorFeatureKey;
      run: (editor: LexicalEditor) => void;
    },
  ) {
    super(key);
    this.label = config.label;
    this.description = config.description;
    this.group = config.group;
    this.keywords = config.keywords ?? [];
    this.feature = config.feature;
    this.run = config.run;
  }
}
