"use client";
import { $isLinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  type LexicalNode,
  PASTE_COMMAND,
  type PasteCommandType,
} from "lexical";
import { useEffect } from "react";

import type { MentionLinkReader } from "../mention.type";
import { rememberMention } from "../mentionCache";
import { $createMentionNode, $insertMention } from "../nodes/mentionNode.util";
import { pastedLinkOf, readMentionLink } from "./mentionPlugin.util";

interface MentionPastePluginProps {
  readers: readonly MentionLinkReader[];
}

const $isLinkOrCode = (node: LexicalNode) => $isLinkNode(node) || node.getType() === "code";

// Token mode keeps the pending link from merging into its neighbours or being autolinked while the read is in flight.
export const MentionPastePlugin = ({ readers }: MentionPastePluginProps) => {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event: PasteCommandType) => {
          const pasted =
            event instanceof ClipboardEvent ? pastedLinkOf(event.clipboardData?.getData("text/plain")) : null;
          const selection = $getSelection();
          if (!pasted || !$isRangeSelection(selection) || !selection.isCollapsed() || selection.hasFormat("code"))
            return false;
          if ($findMatchingParent(selection.anchor.getNode(), $isLinkOrCode)) return false;
          const pending = readMentionLink(readers, pasted.url);
          if (!pending) return false;
          event.preventDefault();
          const placeholder = $createTextNode(pasted.text).setMode("token");
          selection.insertNodes([placeholder]);
          const key = placeholder.getKey();
          void pending.then((mention) =>
            editor.update(() => {
              const node = $getNodeByKey(key);
              if (!$isTextNode(node) || !node.isAttached() || node.getTextContent() !== pasted.text) return;
              if (!mention) {
                node.setMode("normal");
                return;
              }
              const payload = rememberMention(mention);
              const caret = $getSelection();
              if ($isRangeSelection(caret) && caret.isCollapsed() && caret.anchor.key === key)
                $insertMention(payload, node);
              else node.replace($createMentionNode(payload));
            }),
          );
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    [editor, readers],
  );
  return null;
};
