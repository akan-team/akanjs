"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import type { EditorContent } from "@libs/shared/common";
import {
  $createParagraphNode,
  $getRoot,
  $onUpdate,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ENTER_COMMAND,
} from "lexical";
import { useCallback, useEffect, useRef } from "react";

import { $closeCodeFence, $entersNewline } from "./submitPlugin.command";

/**
 * ⌘↩ / Ctrl+↩ submits the field — and with `submitKey: "enter"`, ↩ does too — and this plugin empties it
 * **once the submit has succeeded**.
 *
 * Clearing has to happen here rather than through the `value` prop: `ExternalValuePlugin` refuses to
 * overwrite a focused editor, and a submit from the keyboard leaves focus exactly where it was. Emptying
 * through the `value` prop would therefore do nothing, silently, and the sent text would stay on screen.
 *
 * A rejected `onSubmit` leaves the document alone, so a failed send is retryable instead of lost — the host
 * is the one that reports the failure. A submit in flight also blocks another, so holding ⌘↩ down sends once.
 *
 * The submitted content is read out of the editor rather than taken from the host's state, because the
 * host is fed by a debounced `onChange` — a keystroke followed immediately by ⌘↩ would otherwise submit
 * the document as it stood up to 300ms ago.
 *
 * **Two paths, because an IME swallows the first one.** Lexical's `onKeyDown` returns before dispatching
 * anything while a composition is open (`LexicalEvents.ts`: `if (editor.isComposing()) return`), so
 * `KEY_ENTER_COMMAND` never fires for the keystroke that commits a Korean syllable — which is why ⌘↩ used
 * to need pressing twice, the first press only closing the composition. The native listener catches that
 * case and defers the submit to the update that lands the composed text; `$onCompositionEndImpl` clears
 * the composition key before inserting it, so by then `isComposing()` is false and the text is in state.
 * The two paths cannot both fire for one keystroke: they split on the same predicate Lexical splits on.
 *
 * **A plain ↩ waits for its echo instead.** The Korean IME commits the syllable and then passes the Enter on —
 * Chrome as a second, non-composing keydown, which reaches `KEY_ENTER_COMMAND` with the text already in state,
 * and Safari as an `insertParagraph` in the same update that ends the composition, which is swallowed and replayed
 * as an Enter once that update has committed. Sending on the commit itself would send twice in Chrome, and would
 * send on the Enter a Japanese IME uses to confirm a conversion, which it never passes on.
 */
export interface SubmitPluginProps {
  /** Rejecting keeps the document as it is; resolving empties it. */
  onSubmit: (content: EditorContent) => void | Promise<void>;
  /**
   * Handed the submit function once the editor is live, so a control **outside** the editor — a send
   * button — can go through this same path.
   *
   * It has to: `OnChangePlugin` ignores a `history-merge`-tagged update, which is what the first
   * keystroke into an empty field is, so the host's debounced copy of the document is still empty
   * one character in. A button that reads the host's state would drop a one-character message.
   */
  onReady?: (submit: () => void) => void;
  /**
   * `"modEnter"`, the default, sends on ⌘↩ / Ctrl+↩ alone. `"enter"` is a chat composer's: ↩ sends and ⇧↩ breaks
   * the line, except on a touch keyboard — which has no ⇧↩ — inside a code block or an unclosed ``` fence, and
   * while a typeahead menu has a row to pick. ⌘↩ sends from any of those.
   */
  submitKey?: "enter" | "modEnter";
}

interface PendingEnter {
  event: KeyboardEvent;
  on: "commit" | "echo";
}

const isCoarsePointer = () => window.matchMedia("(pointer: coarse)").matches;

export const SubmitPlugin = ({ onSubmit, onReady, submitKey = "modEnter" }: SubmitPluginProps) => {
  const [editor] = useLexicalComposerContext();
  // Each registration happens once per editor, so the handlers read the latest callback through a ref.
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  // Set between an Enter pressed mid-composition and the moment it is acted on.
  const pendingRef = useRef<PendingEnter | null>(null);
  // Set while a submit is in flight.
  const busyRef = useRef(false);

  const submit = useCallback(() => {
    if (busyRef.current) return;
    const content = editor.getEditorState().toJSON() as EditorContent;
    busyRef.current = true;
    void (async () => {
      try {
        await submitRef.current(content);
        editor.update(() => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          root.append(paragraph);
          paragraph.select();
        });
      } catch {
        // The host reports the failure; keeping the document is what makes the send retryable.
      } finally {
        busyRef.current = false;
      }
    })();
  }, [editor]);

  useEffect(() => {
    readyRef.current?.(submit);
  }, [submit]);

  // CRITICAL, registered before any typeahead menu opens (they sit at CRITICAL too), so ⌘↩ still sends over one.
  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!event?.metaKey && !event?.ctrlKey) return false;
          event?.preventDefault();
          submit();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    [editor, submit],
  );

  useEffect(() => {
    if (submitKey !== "enter") return;
    const takeEcho = () => {
      const pending = pendingRef.current;
      if (pending?.on !== "echo") return false;
      pendingRef.current = null;
      // The echo shares an update with the composed text; the replay waits for it to commit, then for a fresh task.
      $onUpdate(() => queueMicrotask(() => editor.dispatchCommand(KEY_ENTER_COMMAND, pending.event)));
      return true;
    };
    return mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          // A composition committed with a trailing newline dispatches a null Enter before its text lands.
          if (!event) return takeEcho();
          if (event.shiftKey) return false;
          pendingRef.current = null;
          if ($closeCodeFence()) {
            event.preventDefault();
            return true;
          }
          if (isCoarsePointer() || $entersNewline()) return false;
          event.preventDefault();
          submit();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(INSERT_PARAGRAPH_COMMAND, takeEcho, COMMAND_PRIORITY_CRITICAL),
    );
  }, [editor, submit, submitKey]);

  useEffect(() => {
    // No preventDefault here: the keystroke has to reach the IME so the composition commits.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        if (pendingRef.current?.on === "echo") pendingRef.current = null;
        return;
      }
      if (!editor.isComposing()) return;
      if (event.metaKey || event.ctrlKey) pendingRef.current = { event, on: "commit" };
      else if (submitKey === "enter" && !event.shiftKey && !isCoarsePointer())
        pendingRef.current = { event, on: "echo" };
    };
    const onBlur = () => {
      pendingRef.current = null;
    };
    return editor.registerRootListener((rootElement, prevRootElement) => {
      prevRootElement?.removeEventListener("keydown", onKeyDown);
      prevRootElement?.removeEventListener("blur", onBlur);
      rootElement?.addEventListener("keydown", onKeyDown);
      rootElement?.addEventListener("blur", onBlur);
    });
  }, [editor, submitKey]);

  useEffect(
    () =>
      editor.registerUpdateListener(() => {
        if (pendingRef.current?.on !== "commit" || editor.isComposing()) return;
        pendingRef.current = null;
        submit();
      }),
    [editor, submit],
  );
  return null;
};
