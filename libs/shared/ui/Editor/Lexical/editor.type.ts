import type { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import type { cnst } from "@libs/shared/client";
import type { ComponentProps } from "react";

export type AddFile = (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => unknown;

/**
 * Live collaboration for one document.
 *
 * Three of the editor's own plugins have to stand down while this is on, which is why it is a prop and not
 * something `plugins` can add: `HistoryPlugin` would let one person's undo revert someone else's typing
 * (`Y.UndoManager`, which `CollaborationPlugin` installs, is scoped to the local client), `ExternalValuePlugin`
 * would overwrite the shared document whenever the `value` prop changed, and a local initial state would give
 * every client its own starting state instead of the one the room agreed on.
 */
export interface EditorCollab {
  /** Room identity — one per document. */
  id: string;
  providerFactory: ComponentProps<typeof CollaborationPlugin>["providerFactory"];
  /** True for exactly one client per empty document; every other client must say false. */
  shouldBootstrap: boolean;
  username?: string;
  cursorColor?: string;
}
