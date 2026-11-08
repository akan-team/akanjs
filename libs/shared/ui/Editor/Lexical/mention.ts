import type { MentionLinkReader, MentionSource } from "./mention.type";
import type { EditorPlugin } from "./plugin";

/**
 * Turns mentionable models into an editor `plugins` entry.
 *
 * Shorter than the other extension points on purpose: `MentionNode` is registered
 * with the editor itself (see `config.ts`), so a consuming lib contributes only the
 * search/link behavior — never a node class.
 */
export const mentionEditorPlugin = (sources: readonly MentionSource[]): EditorPlugin => ({ mentionSources: sources });

/** Turns a pasted link to one of the app's own documents into its chip, in a field that takes mentions. */
export const mentionLinkEditorPlugin = (read: MentionLinkReader): EditorPlugin => ({ readMentionLink: read });
