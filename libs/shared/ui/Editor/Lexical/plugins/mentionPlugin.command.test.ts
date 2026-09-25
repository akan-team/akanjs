import { describe, expect, it } from "bun:test";

import type { MentionSource } from "../mention.type";

// Keeps to `lexical` core: the pure search logic lives in `mentionPlugin.util.ts` so
// neither test file has to pull the @lexical/* sibling packages, whose dev ESM builds
// still trip bun's module loader. See [[akan-lexical-editor-bun-test]].
const sourceOf = (refName: string, overrides: Partial<MentionSource> = {}): MentionSource => ({
  refName,
  label: refName,
  search: async () => [],
  ...overrides,
});

describe("openMentionSource", () => {
  // lexical and the command module are imported inside the tests so this file still
  // loads under a runner that cannot initialize lexical's dev ESM.
  const lexical = () => import("lexical");
  const commands = () => import("./mentionPlugin.command");

  // The trigger insertion runs in a non-discrete update, which Lexical commits on a
  // microtask — so the command listener (synchronous) always scopes the menu before
  // the typeahead ever sees the "@".
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  const makeEditor = async () => {
    const { $createParagraphNode, $getRoot, createEditor } = await lexical();
    const editor = createEditor({
      namespace: "akan-test",
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        $getRoot().append(paragraph);
        paragraph.select();
      },
      { discrete: true },
    );
    return editor;
  };

  it("scopes the menu to one source and types its trigger", async () => {
    const { $getRoot, COMMAND_PRIORITY_EDITOR } = await lexical();
    const { openMentionSource, SET_MENTION_SOURCE_COMMAND } = await commands();
    const editor = await makeEditor();
    const scoped: string[] = [];
    editor.registerCommand(
      SET_MENTION_SOURCE_COMMAND,
      (refName) => {
        scoped.push(refName);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );

    openMentionSource(editor, sourceOf("admin"));
    await flush();

    expect(scoped).toEqual(["admin"]);
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe("@");
  });

  it("opens the picker instead, leaving the document untouched", async () => {
    const { $getRoot, COMMAND_PRIORITY_EDITOR } = await lexical();
    const { openMentionSource, OPEN_MENTION_PICKER_COMMAND, SET_MENTION_SOURCE_COMMAND } = await commands();
    const editor = await makeEditor();
    const opened: string[] = [];
    const scoped: string[] = [];
    editor.registerCommand(
      OPEN_MENTION_PICKER_COMMAND,
      (refName) => {
        opened.push(refName);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
    editor.registerCommand(
      SET_MENTION_SOURCE_COMMAND,
      (refName) => {
        scoped.push(refName);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );

    openMentionSource(editor, sourceOf("user", { Picker: () => null }));
    await flush();

    expect(opened).toEqual(["user"]);
    expect(scoped).toEqual([]);
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe("");
  });
});
