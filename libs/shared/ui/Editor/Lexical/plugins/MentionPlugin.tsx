"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { mergeRegister } from "@lexical/utils";
import { usePage } from "@libs/shared/client";
import { buttonRecipe } from "@libs/util/ui";
import { cn, resolveServerUrl } from "akanjs/client";
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type BaseSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  type TextNode,
} from "lexical";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MentionCandidate, MentionSource } from "../mention.type";
import { rememberMention } from "../mentionCache";
import { $insertMention } from "../nodes/mentionNode.util";
import { TypeaheadPopover, typeaheadAnchorClassName, typeaheadFrameOf } from "../TypeaheadPopover";
import { useLocalOnlyTrigger } from "../typeaheadTrigger";
import { OPEN_MENTION_PICKER_COMMAND, SET_MENTION_SOURCE_COMMAND } from "./mentionPlugin.command";
import { MentionOption } from "./mentionPlugin.option";
import { MentionSession, mentionSearchDebounceMs, searchMentionSources, toMentionPayload } from "./mentionPlugin.util";

interface MentionPluginProps {
  sources: readonly MentionSource[];
}

/**
 * `@`-mention picker over the mentionable models a consumer injected through
 * `mentionEditorPlugin`. Results from every source are merged into one grouped
 * menu; selecting a row inserts a `MentionNode` chip.
 *
 * A model's `/<label>` slash entry funnels into the same menu, scoped to that one
 * source, or opens the source's own `Picker` dialog when it ships one.
 *
 * The query may hold spaces (`@Doyun Kim`); `MentionSession` ends it once a query
 * with a space finds nothing, or on a double space.
 */
export const MentionPlugin = ({ sources }: MentionPluginProps) => {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<MentionOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [scopedRefName, setScopedRefName] = useState<string | null>(null);
  const [pickerRefName, setPickerRefName] = useState<string | null>(null);
  // The caret is lost while a picker dialog holds focus, so it is captured on open.
  const pickerSelection = useRef<BaseSelection | null>(null);

  const session = useMemo(() => new MentionSession(), []);

  const triggerFn = useLocalOnlyTrigger(
    useCallback(
      (text: string) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return null;
        const node = selection.anchor.getNode();
        return session.match(text, { key: node.getKey(), text: node.getTextContent() });
      },
      [session],
    ),
  );

  const scopedSources = useMemo(
    () => (scopedRefName ? sources.filter((source) => source.refName === scopedRefName) : sources),
    [sources, scopedRefName],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SET_MENTION_SOURCE_COMMAND,
        (refName) => {
          setScopedRefName(refName);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        OPEN_MENTION_PICKER_COMMAND,
        (refName) => {
          pickerSelection.current = editor.getEditorState().read(() => $getSelection()?.clone() ?? null);
          setPickerRefName(refName);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
  }, [editor]);

  // Debounced, abortable, and stale-tolerant: the previous rows stay on screen
  // while the next query is in flight, so the menu never blinks empty (which
  // would also drop the typeahead's keyboard capture mid-typing).
  useEffect(() => {
    if (query === null) {
      setOptions([]);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    setIsSearching(true);
    const timer = setTimeout(() => {
      void searchMentionSources(scopedSources, query, controller.signal).then((matches) => {
        if (controller.signal.aborted) return;
        session.settle(query, scopedSources, matches);
        setOptions(matches.map((match) => new MentionOption(match.source, match.candidate)));
        setIsSearching(false);
      });
    }, mentionSearchDebounceMs);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [session, scopedSources, query]);

  const onSelectOption = useCallback(
    (selected: MentionOption, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      const payload = rememberMention(toMentionPayload(selected.source, selected.candidate));
      editor.update(() => $insertMention(payload, nodeToRemove));
      closeMenu();
    },
    [editor],
  );

  const closePicker = useCallback(() => {
    setPickerRefName(null);
    editor.focus();
  }, [editor]);

  const pickerSource = pickerRefName ? sources.find((source) => source.refName === pickerRefName) : undefined;
  const onPickerSelect = useCallback(
    (candidate: MentionCandidate) => {
      if (!pickerSource) return;
      const selection = pickerSelection.current;
      const payload = rememberMention(toMentionPayload(pickerSource, candidate));
      editor.update(() => {
        if (selection) $setSelection(selection.clone());
        $insertMention(payload);
      });
      setPickerRefName(null);
      editor.focus();
    },
    [editor, pickerSource],
  );

  return (
    <>
      <LexicalTypeaheadMenuPlugin<MentionOption>
        options={options}
        onQueryChange={setQuery}
        onSelectOption={onSelectOption}
        onClose={() => {
          setScopedRefName(null);
          session.reset();
        }}
        triggerFn={triggerFn}
        anchorClassName={typeaheadAnchorClassName}
        // Ahead of a chat composer's ↩-to-send (HIGH), so ↩ picks the highlighted row instead of sending.
        commandPriority={COMMAND_PRIORITY_CRITICAL}
        menuRenderFn={(anchorRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
          if (anchorRef.current === null) return null;
          if (!options.length && !isSearching) return null;
          return createPortal(
            <MentionMenuList
              options={options}
              isSearching={isSearching}
              isWide={!!typeaheadFrameOf(editor.getRootElement())}
              showGroups={scopedSources.length > 1}
              selectedIndex={selectedIndex}
              onSelect={selectOptionAndCleanUp}
              onHighlight={setHighlightedIndex}
            />,
            anchorRef.current,
          );
        }}
      />
      {pickerSource?.Picker ? (
        <MentionPickerDialog label={pickerSource.label} onClose={closePicker}>
          <pickerSource.Picker onSelect={onPickerSelect} onClose={closePicker} />
        </MentionPickerDialog>
      ) : null}
    </>
  );
};

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MentionPickerDialogProps {
  label: string;
  children: ReactNode;
  onClose: () => void;
}

/**
 * Shared chrome around a source-supplied `Picker`, portaled to `<body>` for the
 * same reason as the Excalidraw modal: a transformed or clipped ancestor would
 * otherwise trap the fixed overlay inside the editor card.
 */
export const MentionPickerDialog = ({ label, children, onClose }: MentionPickerDialogProps) => {
  const { l } = usePage();
  const dialogRef = useRef<HTMLDivElement>(null);

  // A modal keeps the keyboard inside it: Escape closes it, and Tab cycles through its own controls only.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      const [first, last] = [focusables.at(0), focusables.at(-1)];
      if (!first || !last) return event.preventDefault();
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-foreground/10 bg-background shadow-xl outline-none"
      >
        <div className="flex items-center justify-between border-foreground/10 border-b px-4 py-3">
          <div className="font-semibold">{label}</div>
          <button type="button" className={buttonRecipe({ size: "sm", variant: "ghost" })} onClick={onClose}>
            {l("shared.editor-close")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

interface MentionMenuListProps {
  options: MentionOption[];
  isSearching: boolean;
  isWide?: boolean;
  showGroups: boolean;
  selectedIndex: number | null;
  onSelect: (option: MentionOption) => void;
  onHighlight: (index: number) => void;
}

/** Rows grouped by source, keeping the plugin's flat index for keyboard navigation. */
export const MentionMenuList = ({
  options,
  isSearching,
  isWide,
  showGroups,
  selectedIndex,
  onSelect,
  onHighlight,
}: MentionMenuListProps) => {
  const { l } = usePage();
  const grouped = options
    .map((option, index) => ({ option, index }))
    .reduce<{ source: MentionSource; items: { option: MentionOption; index: number }[] }[]>((acc, entry) => {
      const section = acc.find((candidate) => candidate.source.refName === entry.option.source.refName);
      if (section) section.items.push(entry);
      else acc.push({ source: entry.option.source, items: [entry] });
      return acc;
    }, []);

  return (
    <TypeaheadPopover className={isWide ? "p-1.5" : "w-72"}>
      {grouped.map((section, sectionIdx) => (
        <div key={section.source.refName}>
          {showGroups ? (
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 pt-2 pb-1 font-semibold text-[13px] text-foreground/70",
                sectionIdx > 0 && "mt-1 border-border border-t",
              )}
            >
              {section.source.icon ? <span className="text-sm">{section.source.icon}</span> : null}
              {section.source.label}
            </div>
          ) : null}
          {section.items.map(({ option, index }) => (
            <button
              key={option.key}
              type="button"
              ref={(el) => option.setRefElement(el)}
              className={cn(
                "flex w-full items-center rounded px-2 text-left transition-colors",
                isWide ? "gap-3 py-2" : "gap-2 py-1.5",
                index === selectedIndex ? "bg-muted" : "hover:bg-muted/60",
              )}
              // Keep editor selection intact while clicking the menu.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
              onClick={() => onSelect(option)}
            >
              <span
                className={cn(
                  "grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-medium text-foreground/70 text-xs",
                  isWide ? "size-7" : "size-6",
                )}
              >
                {option.candidate.imageUrl ? (
                  <img src={resolveServerUrl(option.candidate.imageUrl)} alt="" className="size-full object-cover" />
                ) : (
                  Array.from(option.candidate.label.replace(/^[^\p{L}\p{N}]+/u, ""))[0]?.toUpperCase()
                )}
              </span>
              {isWide ? (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium text-[15px]">{option.candidate.label}</span>
                  {option.candidate.description ? (
                    <span className="max-w-[45%] shrink-0 truncate text-foreground/50 text-sm">
                      {option.candidate.description}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">{option.candidate.label}</span>
                  {option.candidate.description ? (
                    <span className="block truncate text-foreground/50 text-xs">{option.candidate.description}</span>
                  ) : null}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      {isSearching ? (
        <div className="px-2 py-1.5 text-foreground/40 text-xs">{l("shared.editor-searching")}</div>
      ) : null}
    </TypeaheadPopover>
  );
};
