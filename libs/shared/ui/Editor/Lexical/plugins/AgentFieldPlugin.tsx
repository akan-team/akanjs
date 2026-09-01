"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { capitalize } from "akanjs/common";
import { FormFields } from "akanjs/store";
import type { EditorState } from "lexical";
import { type ReactNode, useMemo } from "react";

import { type AgentField, AgentFieldProvider } from "../agentField";
import type { EditorFeature } from "../feature";
import { AKAN_FEATURES } from "../markdown";

interface AgentFieldPluginProps {
  /** The `set<Field>On<Model>` this editor writes, or null to publish nothing. Frozen at mount. */
  name: string | null;
  /** Whether to offer the block read/edit pair. Off for a field too short to address by block. */
  blocks?: boolean;
  /** What `plugins` contributed, so a plugin node counts as a loss instead of being overwritten silently. */
  features: readonly EditorFeature[];
  /**
   * Commits the pending change immediately — the 300ms debounce would leave the form stale, and on an
   * empty field there is no pending change at all, because `OnChangePlugin` drops the update that fills one.
   */
  flush: (state?: EditorState) => void;
  children: ReactNode;
}

/** Supplies {@link AgentField} to every plugin under it, so tool naming is derived in exactly one place. */
export const AgentFieldPlugin = ({ name, blocks = true, features, flush, children }: AgentFieldPluginProps) => {
  const [editor] = useLexicalComposerContext();
  const value = useMemo<AgentField>(() => {
    // Forward through the setter index, never by taking the name apart: `set(.+)On(.+)` has more than
    // one reading whenever a field or a model name contains "On" — `setContentOnAppOnProjectReport` has three.
    const ref = name ? FormFields.ref(name) : null;
    return {
      name,
      blockBase: blocks && ref ? `${capitalize(ref.key)}BlocksOn${capitalize(ref.refName)}` : null,
      features: [...AKAN_FEATURES, ...features],
      content: () => editor.getEditorState().toJSON(),
      commit: async (mutate) => {
        await new Promise<void>((resolve) => {
          editor.update(mutate, { onUpdate: resolve });
        });
        flush(editor.getEditorState());
      },
    };
  }, [editor, name, blocks, features, flush]);
  return <AgentFieldProvider value={value}>{children}</AgentFieldProvider>;
};
