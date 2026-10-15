"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from "lexical";
import { useEffect, useRef, useState } from "react";

/** The layer every floating editor control sits on: above a Modal or BottomSheet hosting the editor. */
export const editorOverlayLayer = "z-[9999]";

/**
 * What a floating control is anchored to, re-read inside an editor read on every update and selection change —
 * and, while one is showing, on scroll and resize, since its rect is viewport-relative. `resolve` returns null
 * to hide the control and `undefined` to leave it where it is.
 */
export const useSelectionAnchor = <Anchor>(resolve: () => Anchor | null | undefined): Anchor | null => {
  const [editor] = useLexicalComposerContext();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const shownRef = useRef(false);

  useEffect(() => {
    const sync = () =>
      editor.getEditorState().read(() => {
        const next = resolveRef.current();
        if (next === undefined) return;
        shownRef.current = next !== null;
        setAnchor(next);
      });
    const onViewportChange = () => {
      if (shownRef.current) sync();
    };
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    const unregister = mergeRegister(
      editor.registerUpdateListener(sync),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          sync();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
    return () => {
      unregister();
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [editor]);

  return anchor;
};
