import { Fragment } from "react";

import { type EditorFeature, type EditorFeatureKey, isPlainOnly } from "./feature";
import type { MentionLinkReader, MentionSource } from "./mention.type";
import type { EditorPlugin, EditorSlashOption } from "./plugin";
import { CalloutPlugin } from "./plugins/CalloutPlugin";
import { CollapsiblePlugin } from "./plugins/CollapsiblePlugin";
import { DraggableBlockPlugin } from "./plugins/DraggableBlockPlugin";
import { FloatingToolbarPlugin } from "./plugins/FloatingToolbarPlugin";
import { LineHintPlugin } from "./plugins/LineHintPlugin";
import { MentionPastePlugin } from "./plugins/MentionPastePlugin";
import { MentionPlugin } from "./plugins/MentionPlugin";
import { PasteFilterPlugin } from "./plugins/PasteFilterPlugin";
import { PlainPastePlugin } from "./plugins/PlainPastePlugin";
import { SlashMenuPlugin } from "./plugins/SlashMenuPlugin";
import { TableActionsPlugin } from "./plugins/TableActionsPlugin";
import { UploadPlugin } from "./plugins/UploadPlugin";

interface EditingPluginsProps {
  editorFeatures: readonly EditorFeature[];
  enabled: ReadonlySet<EditorFeatureKey>;
  isFiltered: boolean;
  slashMenu: boolean;
  extraSlashOptions: EditorSlashOption[];
  mentionSources: MentionSource[];
  mentionLinkReaders: MentionLinkReader[];
  lineHint: string | null;
  toolbar: boolean;
  anchorElem: HTMLElement | null;
  canUpload: boolean;
  plugins?: EditorPlugin[];
}
export const EditingPlugins = ({
  editorFeatures,
  enabled,
  isFiltered,
  slashMenu,
  extraSlashOptions,
  mentionSources,
  mentionLinkReaders,
  lineHint,
  toolbar,
  anchorElem,
  canUpload,
  plugins,
}: EditingPluginsProps) => {
  const has = (key: EditorFeatureKey) => enabled.has(key);
  return (
    <>
      {isPlainOnly(editorFeatures) ? <PlainPastePlugin /> : null}
      {isFiltered ? <PasteFilterPlugin features={editorFeatures} /> : null}
      {slashMenu ? (
        <SlashMenuPlugin features={enabled} extraOptions={extraSlashOptions} mentionSources={mentionSources} />
      ) : null}
      {lineHint ? <LineHintPlugin hint={lineHint} /> : null}
      {has("mention") && mentionSources.length ? <MentionPlugin sources={mentionSources} /> : null}
      {has("mention") && mentionLinkReaders.length ? <MentionPastePlugin readers={mentionLinkReaders} /> : null}
      {toolbar ? <FloatingToolbarPlugin features={enabled} /> : null}
      {anchorElem ? <DraggableBlockPlugin anchorElem={anchorElem} /> : null}
      {has("callout") ? <CalloutPlugin /> : null}
      {has("collapsible") ? <CollapsiblePlugin /> : null}
      {has("table") ? <TableActionsPlugin /> : null}
      {canUpload && (has("image") || has("video") || has("file")) ? <UploadPlugin features={enabled} /> : null}
      {plugins?.map((plugin, index) => (
        <Fragment key={index}>{plugin.render?.()}</Fragment>
      ))}
    </>
  );
};
