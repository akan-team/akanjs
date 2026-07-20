"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin, useBasicTypeaheadTriggerMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { TextNode } from "lexical";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { EditorSlashOption } from "../plugin";
import { useEditorUpload } from "../UploadContext";
import type { SlashOption } from "./slashMenuPlugin.option";
import type { SlashGroup } from "./slashMenuPlugin.type";
import { buildOptions, matchesQuery } from "./slashMenuPlugin.util";

const GROUP_LABELS: Record<SlashGroup, string> = {
  text: "Text",
  list: "Lists",
  media: "Media",
  structure: "Structure",
};
// Group render order.
const GROUP_ORDER: SlashGroup[] = ["text", "list", "media", "structure"];

/**
 * Slash-command block picker. Typing `/` opens a grouped, searchable menu;
 * ↑/↓/Enter select, Esc closes (all handled by `LexicalTypeaheadMenuPlugin`).
 * Selecting an option removes the `/query` text and runs the block conversion
 * or media insertion.
 */
export const SlashMenuPlugin = ({ extraOptions = [] }: { extraOptions?: readonly EditorSlashOption[] }) => {
  const [editor] = useLexicalComposerContext();
  const upload = useEditorUpload();
  const [query, setQuery] = useState<string | null>(null);
  const allOptions = useMemo(() => buildOptions(upload, extraOptions), [upload, extraOptions]);

  // `/` opens the menu at a word boundary; query is a single token (no spaces),
  // matching the Lexical playground convention so the menu closes on space.
  const triggerFn = useBasicTypeaheadTriggerMatch("/", { minLength: 0 });

  const options = useMemo(() => {
    if (!query) return allOptions;
    return allOptions.filter((option) => matchesQuery(option, query));
  }, [allOptions, query]);

  const onSelectOption = useCallback(
    (selected: SlashOption, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      // Drop the "/query" trigger text, then run the block change (each helper
      // opens its own update / dispatches its own command).
      editor.update(() => nodeToRemove?.remove());
      selected.run(editor);
      closeMenu();
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<SlashOption>
      options={options}
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      triggerFn={triggerFn}
      menuRenderFn={(anchorRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        if (anchorRef.current === null || options.length === 0) return null;
        return createPortal(
          <SlashMenuList
            options={options}
            selectedIndex={selectedIndex}
            onSelect={selectOptionAndCleanUp}
            onHighlight={setHighlightedIndex}
          />,
          anchorRef.current,
        );
      }}
    />
  );
};

interface SlashMenuListProps {
  options: SlashOption[];
  selectedIndex: number | null;
  onSelect: (option: SlashOption) => void;
  onHighlight: (index: number) => void;
}

/** Renders the filtered options grouped under section headings, tracking the flat index. */
export const SlashMenuList = ({ options, selectedIndex, onSelect, onHighlight }: SlashMenuListProps) => {
  // Preserve the plugin's flat index while presenting grouped sections.
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: options.map((option, index) => ({ option, index })).filter(({ option }) => option.group === group),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="z-50 max-h-80 w-64 overflow-y-auto rounded-md border border-base-content/10 bg-base-100 p-1 shadow-lg">
      {grouped.map((section) => (
        <div key={section.group}>
          <div className="px-2 py-1 font-medium text-base-content/40 text-xs uppercase tracking-wide">
            {GROUP_LABELS[section.group]}
          </div>
          {section.items.map(({ option, index }) => (
            <button
              key={option.key}
              type="button"
              ref={(el) => option.setRefElement(el)}
              className={`flex w-full flex-col items-start rounded px-2 py-1.5 text-left transition-colors ${
                index === selectedIndex ? "bg-base-200" : "hover:bg-base-200/60"
              }`}
              // Keep editor selection intact while clicking the menu.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHighlight(index)}
              onClick={() => onSelect(option)}
            >
              <span className="font-medium text-sm">{option.label}</span>
              <span className="text-base-content/50 text-xs">{option.description}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
