"use client";
import type { Transformer } from "@lexical/markdown";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";

import { validateLinkUrl } from "./editor.util";
import type { EditorFeatureKey } from "./feature";
import { AutoLinkPlugin } from "./plugins/AutoLinkPlugin";
import { CodeHighlightPlugin } from "./plugins/CodeHighlightPlugin";
import { HorizontalRulePlugin } from "./plugins/HorizontalRulePlugin";

interface FormatPluginsProps {
  isCollab: boolean;
  enabled: ReadonlySet<EditorFeatureKey>;
  markdown: boolean;
  transformers: Transformer[];
}
export const FormatPlugins = ({ isCollab, enabled, markdown, transformers }: FormatPluginsProps) => {
  const has = (key: EditorFeatureKey) => enabled.has(key);
  return (
    <>
      {isCollab ? null : <HistoryPlugin />}
      {has("list") ? (
        <>
          <ListPlugin />
          <CheckListPlugin />
        </>
      ) : null}
      {has("link") ? (
        <>
          <LinkPlugin validateUrl={validateLinkUrl} />
          <AutoLinkPlugin />
        </>
      ) : null}
      {has("divider") ? <HorizontalRulePlugin /> : null}
      {has("list") || has("code") ? <TabIndentationPlugin /> : null}
      {has("code") ? <CodeHighlightPlugin /> : null}
      {markdown && transformers.length ? <MarkdownShortcutPlugin transformers={transformers} /> : null}
      {has("table") ? <TablePlugin hasCellMerge hasCellBackgroundColor /> : null}
    </>
  );
};
