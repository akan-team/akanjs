"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";

/**
 * Neutralizes every href in a read-only tree: mention chips (`data-mention-href`)
 * and ordinary `<a>` links alike. Mounted instead of `MentionLinkPlugin` when
 * `Editor.RichContent` renders with `disableHref` — public pages show documents whose
 * links point into app routes the visitor cannot open.
 *
 * A click guard rather than `pointer-events: none` so the text stays selectable.
 */
export const HrefGuardPlugin = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.closest("[data-mention-href], a[href]")) return;
      event.preventDefault();
    };
    return editor.registerRootListener((rootElement, prevRootElement) => {
      prevRootElement?.removeEventListener("click", onClick);
      rootElement?.addEventListener("click", onClick);
    });
  }, [editor]);

  return null;
};
