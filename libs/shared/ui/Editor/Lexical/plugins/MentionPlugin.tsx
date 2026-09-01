"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin, useBasicTypeaheadTriggerMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { mergeRegister } from "@lexical/utils";
import { buttonRecipe } from "@libs/util/ui";
import { $getSelection, $setSelection, type BaseSelection, COMMAND_PRIORITY_EDITOR, type TextNode } from "lexical";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MentionCandidate, MentionSource } from "../mention.type";
import { $insertMention } from "../nodes/mentionNode.util";
import { OPEN_MENTION_PICKER_COMMAND, SET_MENTION_SOURCE_COMMAND } from "./mentionPlugin.command";
import { MentionOption } from "./mentionPlugin.option";
import {
  MENTION_SEARCH_DEBOUNCE_MS,
  MENTION_TRIGGER,
  searchMentionSources,
  toMentionPayload,
} from "./mentionPlugin.util";

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
 * Whitespace closes the menu (the basic trigger's default) — pass `allowWhitespace`
 * if labels with spaces ever need to be searchable.
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

  const triggerFn = useBasicTypeaheadTriggerMatch(MENTION_TRIGGER, { minLength: 0 });

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
        setOptions(matches.map((match) => new MentionOption(match.source, match.candidate)));
        setIsSearching(false);
      });
    }, MENTION_SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [scopedSources, query]);

  const onSelectOption = useCallback(
    (selected: MentionOption, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      editor.update(() => $insertMention(toMentionPayload(selected.source, selected.candidate), nodeToRemove));
      closeMenu();
    },
    [editor],
  );

  const closePicker = useCallback(() => setPickerRefName(null), []);

  const pickerSource = pickerRefName ? sources.find((source) => source.refName === pickerRefName) : undefined;
  const onPickerSelect = useCallback(
    (candidate: MentionCandidate) => {
      if (!pickerSource) return;
      const selection = pickerSelection.current;
      editor.update(() => {
        if (selection) $setSelection(selection.clone());
        $insertMention(toMentionPayload(pickerSource, candidate));
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
        onClose={() => setScopedRefName(null)}
        triggerFn={triggerFn}
        // Lexical appends this anchor to <body> with no z-index; without one the menu
        // renders under any positioned overlay hosting the editor (Modal, BottomSheet).
        anchorClassName="z-[9999]"
        menuRenderFn={(anchorRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
          if (anchorRef.current === null) return null;
          if (!options.length && !isSearching) return null;
          return createPortal(
            <MentionMenuList
              options={options}
              isSearching={isSearching}
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
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-foreground/10 bg-background shadow-xl">
        <div className="flex items-center justify-between border-foreground/10 border-b px-4 py-3">
          <div className="font-semibold">{label}</div>
          <button type="button" className={buttonRecipe({ size: "sm", variant: "ghost" })} onClick={onClose}>
            Close
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
  showGroups: boolean;
  selectedIndex: number | null;
  onSelect: (option: MentionOption) => void;
  onHighlight: (index: number) => void;
}

/** Rows grouped by source, keeping the plugin's flat index for keyboard navigation. */
export const MentionMenuList = ({
  options,
  isSearching,
  showGroups,
  selectedIndex,
  onSelect,
  onHighlight,
}: MentionMenuListProps) => {
  const grouped = options
    .map((option, index) => ({ option, index }))
    .reduce<{ refName: string; label: string; items: { option: MentionOption; index: number }[] }[]>((acc, entry) => {
      const section = acc.find((candidate) => candidate.refName === entry.option.source.refName);
      if (section) section.items.push(entry);
      else acc.push({ refName: entry.option.source.refName, label: entry.option.source.label, items: [entry] });
      return acc;
    }, []);

  return (
    <div className="max-h-80 w-72 overflow-y-auto rounded-md border border-foreground/10 bg-background p-1 shadow-lg">
      {grouped.map((section) => (
        <div key={section.refName}>
          {showGroups ? (
            <div className="px-2 py-1 font-medium text-foreground/40 text-xs uppercase tracking-wide">
              {section.label}
            </div>
          ) : null}
          {section.items.map(({ option, index }) => (
            <button
              key={option.key}
              type="button"
              ref={(el) => option.setRefElement(el)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                index === selectedIndex ? "bg-muted" : "hover:bg-muted/60"
              }`}
              // Keep editor selection intact while clicking the menu.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
              onClick={() => onSelect(option)}
            >
              {option.candidate.imageUrl ? (
                <img src={option.candidate.imageUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">{option.candidate.label}</span>
                {option.candidate.description ? (
                  <span className="block truncate text-foreground/50 text-xs">{option.candidate.description}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ))}
      {isSearching ? <div className="px-2 py-1.5 text-foreground/40 text-xs">Searching…</div> : null}
    </div>
  );
};
