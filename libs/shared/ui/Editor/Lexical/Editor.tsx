"use client";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { type cnst, Err, msg, usePage } from "@libs/shared/client";
import type { EditorContent } from "@libs/shared/common";
import { addFileUntilActive } from "@libs/shared/webkit";
import { cn } from "akanjs/client";
import type { ProtoFile } from "akanjs/constant";
import type { EditorState } from "lexical";
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createEditorConfig } from "./config";
import type { AddFile, EditorCollab } from "./editor.type";
import { validateLinkUrl } from "./editor.util";
import { type EditorFeatureKey, featuresOf, isPlainOnly, transformersOf } from "./feature";
import { akanFeatures } from "./markdown";
import { reconcileAttachments } from "./media";
import {
  collectPluginFeatures,
  collectPluginMentionSources,
  collectPluginNodes,
  collectPluginSlashOptions,
  type EditorPlugin,
} from "./plugin";
import { AgentFieldPlugin } from "./plugins/AgentFieldPlugin";
import { AgentMentionPlugin } from "./plugins/AgentMentionPlugin";
import { AgentRichPlugin } from "./plugins/AgentRichPlugin";
import { AutoLinkPlugin } from "./plugins/AutoLinkPlugin";
import { CalloutPlugin } from "./plugins/CalloutPlugin";
import { CodeHighlightPlugin } from "./plugins/CodeHighlightPlugin";
import { CollapsiblePlugin } from "./plugins/CollapsiblePlugin";
import { DraggableBlockPlugin } from "./plugins/DraggableBlockPlugin";
import { EditableSyncPlugin } from "./plugins/EditableSyncPlugin";
import { ExternalValuePlugin } from "./plugins/ExternalValuePlugin";
import { FloatingToolbarPlugin } from "./plugins/FloatingToolbarPlugin";
import { FlushOnBlurPlugin } from "./plugins/FlushOnBlurPlugin";
import { FormatGuardPlugin } from "./plugins/FormatGuardPlugin";
import { HorizontalRulePlugin } from "./plugins/HorizontalRulePlugin";
import { MentionLinkPlugin } from "./plugins/MentionLinkPlugin";
import { MentionPlugin } from "./plugins/MentionPlugin";
import { PasteFilterPlugin } from "./plugins/PasteFilterPlugin";
import { PlainPastePlugin } from "./plugins/PlainPastePlugin";
import { SlashMenuPlugin } from "./plugins/SlashMenuPlugin";
import { TableActionsPlugin } from "./plugins/TableActionsPlugin";
import { UploadPlugin } from "./plugins/UploadPlugin";
import { toSerializedEditorState } from "./softGuard";
import { type EditorUpload, EditorUploadProvider } from "./UploadContext";
import { normalizeUploadPolicy, type UploadPolicy, validateUploadFile } from "./upload";

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
  /** Live collaboration. Present, it replaces the local history and the external-value sync — see EditorCollab. */
  collab?: EditorCollab;
}

const changeDebounceMs = 300;

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

  // Latest values kept in refs so the change/upload callbacks stay identity-stable.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const addFileRef = useRef(addFile);
  addFileRef.current = addFile;
  const attachmentsRef = useRef<cnst.File[]>(attachments ?? []);
  const onAttachmentsChangeRef = useRef(onAttachmentsChange);
  const onUploadErrorRef = useRef(onUploadError);
  const mountedRef = useRef(false);
  useEffect(() => {
    attachmentsRef.current = attachments ?? [];
  }, [attachments]);
  useEffect(() => {
    onAttachmentsChangeRef.current = onAttachmentsChange;
    onUploadErrorRef.current = onUploadError;
  }, [onAttachmentsChange, onUploadError]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const latestStateRef = useRef<EditorState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const policy = useMemo(() => normalizeUploadPolicy(uploadPolicy), [uploadPolicy]);

  // Serialize once, then persist and reconcile attachments off the same JSON.
  const commit = useCallback(() => {
    const state = latestStateRef.current;
    if (!state) return;
    const json = state.toJSON();
    onChangeRef.current(json as EditorContent);
    if (onAttachmentsChangeRef.current) {
      const next = reconcileAttachments(json, attachmentsRef.current);
      if (next.length !== attachmentsRef.current.length) {
        attachmentsRef.current = next;
        onAttachmentsChangeRef.current(next);
      }
    }
  }, []);

  // `state` is for a writer that produced one without `OnChangePlugin` seeing it: Lexical drops any update whose
  // *previous* state was empty (`prevEditorState.isEmpty()`), so the first write into an empty field never reaches
  // `handleChange`. A person types again and the next keystroke carries the document; an agent writes once.
  // Without one, only a change still waiting on the debounce is committed — a blur that follows no edit writes nothing.
  const flush = useCallback(
    (state?: EditorState) => {
      if (state) latestStateRef.current = state;
      else if (!timerRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      commit();
    },
    [commit],
  );

  const handleChange = useCallback(
    (editorState: EditorState) => {
      latestStateRef.current = editorState;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        commit();
      }, changeDebounceMs);
    },
    [commit],
  );

  // The external value replaced the document, so a commit still pending from before would write it back over.
  const onExternalValue = useCallback((state: EditorState) => {
    latestStateRef.current = state;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const uploadFile = useCallback(
    async (file: File, accept?: string) => {
      if (!addFilesGql) throw new Err("shared.error.fileUploadNotConfigured");
      validateUploadFile(file, policy, attachmentsRef.current.length, accept);
      const uploaded = (await addFileUntilActive(file, addFilesGql)) as cnst.File;
      // A form closed while its upload ran must not receive it: `addFile` writes whatever form is open now.
      if (!mountedRef.current) return null;
      if (addFileRef.current) await addFileRef.current(uploaded);
      const next = [...attachmentsRef.current.filter((attachment) => attachment.id !== uploaded.id), uploaded];
      attachmentsRef.current = next;
      onAttachmentsChangeRef.current?.(next);
      return uploaded;
    },
    [addFilesGql, policy],
  );

  const uploadValue = useMemo<EditorUpload>(
    () => ({
      canUpload: editable && !!addFilesGql,
      policy,
      uploadFile,
      onError: (error) => {
        if (onUploadErrorRef.current) return onUploadErrorRef.current(error);
        const { error: key, data } = error as { error?: unknown; data?: Record<string, unknown> };
        msg.error(
          typeof key === "string" ? (key as Parameters<typeof msg.error>[0]) : "shared.error.fileUploadFailed",
          {
            data,
          },
        );
      },
    }),
    [editable, addFilesGql, policy, uploadFile],
  );

  // Flush any pending change on unmount so the last edit is never dropped.
  useEffect(() => () => flush(), [flush]);

  // The drag handle is pinned to the editor's left edge, so the editable area
  // carries a matching left gutter for it to sit in without overlapping text.
  const showHandle = editable && blockActions;

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
                  className={cn("leading-7 outline-none", showHandle && "pl-2")}
                  aria-placeholder={placeholderText}
                  placeholder={
                    // ContentEditable 과 같은 상자여야 한다 — 이 div 는 절대 위치라 `leading-7` 과
                    // 좌측 패딩을 직접 따라 적어야 첫 줄이 실제 텍스트와 겹친다.
                    <div
                      className={cn(
                        "pointer-events-none absolute top-0 left-0 select-none text-foreground/40 leading-7",
                        showHandle && "pl-2",
                      )}
                    >
                      {placeholderText}
                    </div>
                  }
                  style={{ minHeight: editable ? (height ?? "8rem") : undefined }}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            {collab ? null : <HistoryPlugin />}
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
            {editable && isPlainOnly(editorFeatures) ? <PlainPastePlugin /> : null}
            {editable && features ? <PasteFilterPlugin features={editorFeatures} /> : null}
            {editable && slashMenu ? (
              <SlashMenuPlugin features={enabled} extraOptions={extraSlashOptions} mentionSources={mentionSources} />
            ) : null}
            {editable && has("mention") && mentionSources.length ? <MentionPlugin sources={mentionSources} /> : null}
            {editable && toolbar ? <FloatingToolbarPlugin features={enabled} /> : null}
            {editable && blockActions && anchorElem ? <DraggableBlockPlugin anchorElem={anchorElem} /> : null}
            {editable && has("callout") ? <CalloutPlugin /> : null}
            {editable && has("collapsible") ? <CollapsiblePlugin /> : null}
            {editable && has("table") ? <TableActionsPlugin /> : null}
            {editable && addFilesGql && (has("image") || has("video") || has("file")) ? (
              <UploadPlugin features={enabled} />
            ) : null}
            {editable ? plugins?.map((plugin, index) => <Fragment key={index}>{plugin.render?.()}</Fragment>) : null}
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
