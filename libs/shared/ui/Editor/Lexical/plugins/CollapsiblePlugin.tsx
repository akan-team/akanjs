"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot, mergeRegister } from "@lexical/utils";
import { $createParagraphNode, COMMAND_PRIORITY_LOW } from "lexical";
import { useEffect } from "react";

import { CollapsibleContainerNode } from "../nodes/Collapsible";
import {
  $createCollapsibleContainerNode,
  $createCollapsibleContentNode,
  $createCollapsibleTitleNode,
  $isCollapsibleContentNode,
  $isCollapsibleTitleNode,
} from "../nodes/collapsible.util";
import { INSERT_COLLAPSIBLE_COMMAND } from "./collapsiblePlugin.util";

/**
 * Wires the collapsible/accordion block: the insert command and a transform that
 * keeps every container well-formed as exactly `[title, content]` (repairing the
 * edge cases where editing deletes one of the two children).
 */
export const CollapsiblePlugin = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        INSERT_COLLAPSIBLE_COMMAND,
        () => {
          editor.update(() => {
            const title = $createCollapsibleTitleNode();
            const content = $createCollapsibleContentNode();
            content.append($createParagraphNode());
            const container = $createCollapsibleContainerNode(true);
            container.append(title, content);
            $insertNodeToNearestRoot(container);
            title.selectEnd();
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // Structure integrity: a container must always be [title, content].
      editor.registerNodeTransform(CollapsibleContainerNode, (node) => {
        const children = node.getChildren();
        if (children.length === 0) {
          node.remove();
          return;
        }
        const hasTitle = children.some($isCollapsibleTitleNode);
        const hasContent = children.some($isCollapsibleContentNode);
        if (!hasContent) {
          const content = $createCollapsibleContentNode();
          content.append($createParagraphNode());
          node.append(content);
        }
        if (!hasTitle) {
          node.splice(0, 0, [$createCollapsibleTitleNode()]);
        }
      }),
    );
  }, [editor]);

  return null;
};
