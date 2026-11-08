"use client";
import { $isLinkNode, AutoLinkNode, LinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { RichUrl } from "@libs/shared/common";
import { router } from "akanjs/client";
import { $getNodeByKey, type NodeKey, type NodeMutation } from "lexical";
import { useEffect } from "react";

/**
 * Makes mention chips navigable off their stored `data-mention-href`, and opens a link to another site in a new
 * tab, as `ContentHtml` draws it on the server.
 *
 * Delegated from the root element instead of the node, because the chip is a plain
 * `<span>` — a `TextNode` cannot choose its own tag (`TextNode.__format` picks it),
 * so there is no anchor to click. Mounted in both trees: read-only content routes
 * on a plain click, while an editable tree navigates only on ⌘/Ctrl+click so an
 * ordinary click can still place the caret.
 */
export const MentionLinkPlugin = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const chip = target.closest<HTMLElement>("[data-mention-href]");
      const href = RichUrl.internalPath(chip?.dataset.mentionHref);
      if (!href) return;
      if (editor.isEditable() && !event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      router.push(href);
    };
    const onLinkMutation = (mutations: Map<NodeKey, NodeMutation>) => {
      editor.getEditorState().read(() => {
        for (const [key, mutation] of mutations) {
          const node = mutation === "destroyed" ? null : $getNodeByKey(key);
          const anchor = editor.getElementByKey(key);
          if (!$isLinkNode(node) || !(anchor instanceof HTMLAnchorElement)) continue;
          const isExternal = !!RichUrl.external(node.getURL());
          const linkTarget = isExternal ? "_blank" : node.getTarget();
          const rel = isExternal ? "noreferrer noopener" : node.getRel();
          if (linkTarget) anchor.target = linkTarget;
          else anchor.removeAttribute("target");
          if (rel) anchor.rel = rel;
          else anchor.removeAttribute("rel");
        }
      });
    };
    return mergeRegister(
      editor.registerRootListener((rootElement, prevRootElement) => {
        prevRootElement?.removeEventListener("click", onClick);
        rootElement?.addEventListener("click", onClick);
      }),
      editor.registerMutationListener(LinkNode, onLinkMutation),
      editor.registerMutationListener(AutoLinkNode, onLinkMutation),
    );
  }, [editor]);

  return null;
};
