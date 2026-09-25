"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { router } from "akanjs/client";
import { useEffect } from "react";

/**
 * Makes mention chips navigable off their stored `data-mention-href`.
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
      const href = chip?.dataset.mentionHref;
      if (!href) return;
      if (editor.isEditable() && !event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      router.push(href);
    };
    return editor.registerRootListener((rootElement, prevRootElement) => {
      prevRootElement?.removeEventListener("click", onClick);
      rootElement?.addEventListener("click", onClick);
    });
  }, [editor]);

  return null;
};
