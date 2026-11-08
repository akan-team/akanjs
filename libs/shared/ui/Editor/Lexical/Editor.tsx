"use client";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { type cnst, usePage } from "@libs/shared/client";
import type { EditorContent } from "@libs/shared/common";
import { cn } from "akanjs/client";
import type { ProtoFile } from "akanjs/constant";
import { lazy, Suspense, useMemo, useState } from "react";

import { createEditorConfig } from "./config";
import { EditingPlugins } from "./EditingPlugins";
import type { AddFile, EditorCollab } from "./editor.type";
import { useEditorCommit } from "./editorCommit";
import { FormatPlugins } from "./FormatPlugins";
import { type EditorFeatureKey, featuresOf, transformersOf } from "./feature";
import { akanFeatures } from "./markdown";
import {
  collectPluginFeatures,
  collectPluginMentionLinkReaders,
  collectPluginMentionSources,
  collectPluginNodes,
  collectPluginSlashOptions,
  type EditorPlugin,
} from "./plugin";
import { AgentFieldPlugin } from "./plugins/AgentFieldPlugin";
import { AgentMentionPlugin } from "./plugins/AgentMentionPlugin";
import { AgentRichPlugin } from "./plugins/AgentRichPlugin";
import { EditableSyncPlugin } from "./plugins/EditableSyncPlugin";
import { ExternalValuePlugin } from "./plugins/ExternalValuePlugin";
import { FlushOnBlurPlugin } from "./plugins/FlushOnBlurPlugin";
import { FormatGuardPlugin } from "./plugins/FormatGuardPlugin";
import { MentionLinkPlugin } from "./plugins/MentionLinkPlugin";
import { toSerializedEditorState } from "./softGuard";
import { akanEditorTheme } from "./theme";
import { EditorUploadProvider } from "./UploadContext";
import type { UploadPolicy } from "./upload";
import { useEditorUploadHost } from "./uploadHost";

interface EditorProps {
  className?: string;
  disabled?: boolean;
  value?: unknown;
  onChange: (value: EditorContent) => void;
  addFilesGql?: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile?: AddFile;
  attachments?: cnst.File[];
  onAttachmentsChange?: (files: cnst.File[]) => void;
  /** Omitted, a refused or failed upload is shown to the person as an error message. */
  onUploadError?: (error: Error) => void;
  uploadPolicy?: UploadPolicy;
  toolbar?: boolean;
  blockActions?: boolean;
  slashMenu?: boolean;
  /** Markdown input shortcuts, for whichever `features` are on. Turn off to type `# ` and `- ` literally. */
  markdown?: boolean;
  /**
   * The capabilities this field offers, out of `editorFeatureKeys`. Omitted, it offers all of them.
   *
   * One word takes a capability out of the markdown shortcuts, the slash menu, the floating toolbar, the
   * keyboard shortcut, the plugin that implements it, and the agent's syntax sentence at once — so
   * `features={["mention"]}` is a textarea that takes mentions, with no prop left disagreeing with another.
   */
  features?: readonly EditorFeatureKey[];
  plugins?: EditorPlugin[];
  /** The `set<Field>On<Model>` an agent may write this field through. Omitted, the field is agent-invisible. */
  agentName?: string | null;
  /** Publish the block read/edit pair too. Turn off for a field too short to address by block. */
  agentBlocks?: boolean;
  height?: string;
  placeholder?: string;
  /** Shown faintly on the empty paragraph holding the caret, while the slash menu is on. Omitted, nothing is. */
  lineHint?: string;
  /** Live collaboration. Present, it replaces the local history and the external-value sync — see EditorCollab. */
  collab?: EditorCollab;
}

// A zero-height float takes no room in the line box, so the caret stays at the start of the line under the hint.
const lineHintClassName =
  "[&_[data-line-hint]]:before:pointer-events-none [&_[data-line-hint]]:before:float-left [&_[data-line-hint]]:before:h-0 [&_[data-line-hint]]:before:text-foreground/40 [&_[data-line-hint]]:before:content-[attr(data-line-hint)]";

// `CollaborationPlugin` is what pulls yjs in, so only an editor that collaborates downloads it.
const CollaborationPlugin = lazy(() =>
  import("@lexical/react/LexicalCollaborationPlugin").then(({ CollaborationPlugin }) => ({
    default: CollaborationPlugin,
  })),
);

export default function Editor({
  className,
  disabled,
  value,
  onChange,
  addFile,
  addFilesGql,
  attachments,
  onAttachmentsChange,
  onUploadError,
  uploadPolicy,
  toolbar = true,
  slashMenu = true,
  blockActions = true,
  markdown = true,
  features,
  plugins,
  agentName,
  agentBlocks,
  height,
  placeholder,
  lineHint,
  collab,
}: EditorProps) {
  const { l } = usePage();
  const editable = !disabled;
  const placeholderText = placeholder ?? l("shared.editor-placeholder");
  // The positioned wrapper the floating handle/target-line portal into.
  const [anchorElem, setAnchorElem] = useState<HTMLDivElement | null>(null);
  // Lazy init runs once at mount; LexicalComposer ignores later initialConfig
  // changes — so plugin node classes are read here, at mount, and are fixed.
  const [initialConfig] = useState(() =>
    createEditorConfig({
      editable,
      // In a collaborative editor the starting state comes from the room, not from this client's props.
      initialJson: collab ? undefined : value,
      seedParagraph: !collab,
      extraNodes: collectPluginNodes(plugins),
    }),
  );
  // Fixed at mount like the composer: `CollaborationPlugin` reconnects to the room whenever this string
  // changes, so one rebuilt from every commit re-uploaded the document and re-joined the room each time.
  // A JSON string, not the object: the object branch of `initializeEditor` wants an EditorState instance.
  const [bootstrapJson] = useState(() => {
    const state = collab?.shouldBootstrap ? toSerializedEditorState(value) : null;
    return state ? JSON.stringify(state) : undefined;
  });
  const extraSlashOptions = useMemo(() => collectPluginSlashOptions(plugins), [plugins]);
  const mentionSources = useMemo(() => collectPluginMentionSources(plugins), [plugins]);
  const mentionLinkReaders = useMemo(() => collectPluginMentionLinkReaders(plugins), [plugins]);
  const pluginFeatures = useMemo(() => collectPluginFeatures(plugins), [plugins]);

  // Keyed on the joined names, not on the array: `features` is written inline at most call sites, and a
  // fresh array every render would re-register `FormatGuardPlugin`'s command listener on each one.
  const featureKey = features?.join(",") ?? "*";
  const editorFeatures = useMemo(
    () => [...featuresOf(akanFeatures, features), ...pluginFeatures],
    [featureKey, pluginFeatures],
  );
  const enabled = useMemo(
    () => new Set(editorFeatures.flatMap((feature) => (feature.key ? [feature.key] : []))),
    [editorFeatures],
  );
  const transformers = useMemo(() => transformersOf(editorFeatures), [editorFeatures]);
  const has = (key: EditorFeatureKey) => enabled.has(key);

  const { attachmentsRef, onAttachmentsChangeRef, flush, handleChange, onExternalValue } = useEditorCommit({
    onChange,
    attachments,
    onAttachmentsChange,
  });
  const uploadValue = useEditorUploadHost({
    editable,
    addFilesGql,
    addFile,
    uploadPolicy,
    onUploadError,
    attachmentsRef,
    onAttachmentsChangeRef,
  });

  // The drag handle is pinned to the editor's left edge, so the editable area
  // carries a matching left gutter for it to sit in without overlapping text.
  const showHandle = editable && blockActions;
  const showLineHint = editable && slashMenu && !!lineHint;

  // Without a provider `useCollaborationContext` falls back to one module-global context shared by every
  // editor in the tab, which Lexical marks unsafe and warns about in development.
  const composer = (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorUploadProvider value={uploadValue}>
        <AgentFieldPlugin
          name={editable ? (agentName ?? null) : null}
          blocks={agentBlocks}
          features={editorFeatures}
          flush={flush}
        >
          <div ref={setAnchorElem} className={cn("akan-editor relative w-full", className)}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  // flow-root 는 첫 문단의 위 여백이 바깥으로 빠져나가지 못하게 가둔다 — 그래야 그 여백이
                  // 감싸는 상자가 BFC 인지(overflow, flex 항목)에 따라 달라지지 않고, 플레이스홀더가 같은 값을 쓸 수 있다.
                  className={cn(
                    "flow-root leading-7 outline-none",
                    showHandle && "pl-2",
                    showLineHint && lineHintClassName,
                  )}
                  aria-placeholder={placeholderText}
                  placeholder={
                    // ContentEditable 과 같은 상자여야 한다 — 이 div 는 절대 위치라 좌측 패딩을 직접 따라 적고,
                    // 첫 줄은 빈 문단과 같은 `<p>` 에 테마 클래스를 그대로 써서 여백·행간(앱 CSS 의 덮어쓰기까지)이 같아진다.
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-x-0 top-0 select-none text-foreground/40 leading-7",
                        showHandle && "pl-2",
                      )}
                    >
                      <p className={akanEditorTheme.paragraph}>{placeholderText}</p>
                    </div>
                  }
                  style={{ minHeight: editable ? (height ?? "8rem") : undefined }}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <FormatPlugins isCollab={!!collab} enabled={enabled} markdown={markdown} transformers={transformers} />
            <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
            <FlushOnBlurPlugin onBlur={flush} />
            {collab ? (
              <CollaborationPlugin
                id={collab.id}
                providerFactory={collab.providerFactory}
                shouldBootstrap={collab.shouldBootstrap}
                initialEditorState={bootstrapJson}
                username={collab.username}
                cursorColor={collab.cursorColor}
              />
            ) : (
              <ExternalValuePlugin value={value} onApply={onExternalValue} />
            )}
            <FormatGuardPlugin features={enabled} />
            <AgentRichPlugin />
            {has("mention") ? <AgentMentionPlugin sources={mentionSources} /> : null}
            <EditableSyncPlugin editable={editable} />
            <MentionLinkPlugin />
            {editable ? (
              <EditingPlugins
                editorFeatures={editorFeatures}
                enabled={enabled}
                isFiltered={!!features}
                slashMenu={slashMenu}
                extraSlashOptions={extraSlashOptions}
                mentionSources={mentionSources}
                mentionLinkReaders={mentionLinkReaders}
                lineHint={showLineHint && lineHint ? lineHint : null}
                toolbar={toolbar}
                anchorElem={blockActions ? anchorElem : null}
                canUpload={!!addFilesGql}
                plugins={plugins}
              />
            ) : null}
          </div>
        </AgentFieldPlugin>
      </EditorUploadProvider>
    </LexicalComposer>
  );
  // The boundary sits outside the composer, so the editor never draws — or takes a keystroke — before the room binds.
  return collab ? (
    <Suspense fallback={null}>
      <LexicalCollaboration>{composer}</LexicalCollaboration>
    </Suspense>
  ) : (
    composer
  );
}
