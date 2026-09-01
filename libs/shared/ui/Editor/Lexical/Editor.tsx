"use client";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
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
import { type cnst, Err } from "@libs/shared/client";
import type { EditorContent } from "@libs/shared/common";
import { addFileUntilActive } from "@libs/shared/webkit";
import type { Any } from "akanjs/base";
import { cn } from "akanjs/client";
import type { ProtoFile } from "akanjs/constant";
import { BLUR_COMMAND, COMMAND_PRIORITY_LOW, type EditorState } from "lexical";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createEditorConfig } from "./config";
import type { AddFile } from "./editor.type";
import { validateLinkUrl } from "./editor.util";
import { AKAN_TRANSFORMERS } from "./markdown";
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
import { FloatingToolbarPlugin } from "./plugins/FloatingToolbarPlugin";
import { HorizontalRulePlugin } from "./plugins/HorizontalRulePlugin";
import { MentionLinkPlugin } from "./plugins/MentionLinkPlugin";
import { MentionPlugin } from "./plugins/MentionPlugin";
import { SlashMenuPlugin } from "./plugins/SlashMenuPlugin";
import { TableActionsPlugin } from "./plugins/TableActionsPlugin";
import { UploadPlugin } from "./plugins/UploadPlugin";
import { isSerializedEditorState } from "./softGuard";
import { type EditorUpload, EditorUploadProvider } from "./UploadContext";
import { normalizeUploadPolicy, type UploadPolicy, validateUploadFile } from "./upload";

/**
 * Public prop contract for the Akan editor. Deliberately mirrors the outgoing
 * Yoopta editor so consuming call sites need no changes at cutover.
 *
 * Marks, text blocks, links, code, divider, markdown shortcuts (Phase 1), the
 * interaction layer (Phase 2), media/upload (Phase 3), and the structural blocks
 * (Phase 3b) are all wired. `plugins` injects consumer-owned nodes/slash options/
 * plugin components (see {@link EditorPlugin}) — the PageBlock nested page uses it.
 * `onDelete` stays declared for signature parity; per-node deletion cleanup now
 * runs through a plugin's own mutation listener.
 */
interface EditorProps {
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
  value?: unknown;
  defaultValue?: unknown;
  onChange: (value: EditorContent) => void;
  onDelete?: (nodes: Any[]) => void;
  addFilesGql?: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile?: AddFile;
  attachments?: cnst.File[];
  onAttachmentAdd?: (file: cnst.File) => void;
  onAttachmentsChange?: (files: cnst.File[]) => void;
  onUploadError?: (error: Error) => void;
  uploadPolicy?: UploadPolicy;
  toolbar?: boolean;
  blockActions?: boolean;
  slashMenu?: boolean;
  /** Markdown input shortcuts (`# `, `- `, `> `, …). Turn off for documents that are plain text plus mentions. */
  markdown?: boolean;
  plugins?: EditorPlugin[];
  /** The `set<Field>On<Model>` an agent may write this field through. Omitted, the field is agent-invisible. */
  agentName?: string | null;
  /** Publish the block read/edit pair too. Turn off for a field too short to address by block. */
  agentBlocks?: boolean;
  height?: string;
  placeholder?: string;
  debug?: boolean;
}

const CHANGE_DEBOUNCE_MS = 300;

/** Keeps Lexical's `editable` flag in sync with the `readOnly`/`disabled` props after mount. */
export const EditableSyncPlugin = ({ editable }: { editable: boolean }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(editable);
  }, [editor, editable]);
  return null;
};

/**
 * Commits the pending debounced change the moment the editor loses focus.
 *
 * Without this, clicking away (e.g. into another field of the same form) inside the
 * `CHANGE_DEBOUNCE_MS` window leaves the just-typed text sitting uncommitted in
 * `latestStateRef` while `ExternalValuePlugin`'s focus guard has already dropped
 * (the root is no longer `activeElement`) — a follow-up render with the still-stale
 * `value` prop then overwrites the editor with the pre-edit content, and the pending
 * timer commits that stale state a moment later. Flushing synchronously on blur closes
 * the window entirely: the store is already caught up by the time focus leaves.
 */
export const FlushOnBlurPlugin = ({ onBlur }: { onBlur: () => void }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          onBlur();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, onBlur],
  );
  return null;
};

/**
 * Re-applies an externally-changed `value` imperatively. Guards against the
 * onChange→setState→value feedback loop by (a) skipping while the editor is
 * focused (never clobber active typing) and (b) skipping when the incoming
 * content already equals the current document.
 */
export const ExternalValuePlugin = ({ value }: { value: unknown }) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (!isSerializedEditorState(value)) return;
    const root = editor.getRootElement();
    if (root && root.ownerDocument.activeElement === root) return;
    const current = editor.getEditorState().toJSON();
    if (JSON.stringify(current) === JSON.stringify(value)) return;
    try {
      editor.setEditorState(editor.parseEditorState(value));
    } catch {
      // Corrupt but root-shaped JSON — keep the current document.
    }
  }, [editor, value]);
  return null;
};

/**
 * Akan rich-text editor (Lexical). Phase 1: marks, text blocks, links, code,
 * divider, markdown shortcuts, debounced change→save. Phase 2: slash menu,
 * floating toolbar, block drag handles. Phase 3: media nodes (image/video/file/
 * embed/callout) with upload (drop/paste/slash), resize/align, and attachment
 * reconcile against the host's `attachments`/`onAttachmentsChange`.
 */
export default function Editor({
  readOnly = false,
  disabled,
  className,
  value,
  defaultValue,
  onChange,
  addFile,
  addFilesGql,
  attachments,
  onAttachmentAdd,
  onAttachmentsChange,
  onUploadError,
  uploadPolicy,
  toolbar = true,
  slashMenu = true,
  blockActions = true,
  markdown = true,
  plugins,
  agentName,
  agentBlocks,
  height,
  placeholder = "Type something",
}: EditorProps) {
  const editable = !readOnly && !disabled;
  // The positioned wrapper the floating handle/target-line portal into.
  const [anchorElem, setAnchorElem] = useState<HTMLDivElement | null>(null);
  // Lazy init runs once at mount; LexicalComposer ignores later initialConfig
  // changes — so plugin node classes are read here, at mount, and are fixed.
  const [initialConfig] = useState(() =>
    createEditorConfig({ editable, initialJson: value ?? defaultValue, extraNodes: collectPluginNodes(plugins) }),
  );
  const extraSlashOptions = useMemo(() => collectPluginSlashOptions(plugins), [plugins]);
  const mentionSources = useMemo(() => collectPluginMentionSources(plugins), [plugins]);
  const pluginFeatures = useMemo(() => collectPluginFeatures(plugins), [plugins]);

  // Latest values kept in refs so the change/upload callbacks stay identity-stable.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const addFileRef = useRef(addFile);
  addFileRef.current = addFile;
  const attachmentsRef = useRef<cnst.File[]>(attachments ?? []);
  const onAttachmentAddRef = useRef(onAttachmentAdd);
  const onAttachmentsChangeRef = useRef(onAttachmentsChange);
  const onUploadErrorRef = useRef(onUploadError);
  useEffect(() => {
    attachmentsRef.current = attachments ?? [];
  }, [attachments]);
  useEffect(() => {
    onAttachmentAddRef.current = onAttachmentAdd;
    onAttachmentsChangeRef.current = onAttachmentsChange;
    onUploadErrorRef.current = onUploadError;
  }, [onAttachmentAdd, onAttachmentsChange, onUploadError]);

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
  const flush = useCallback(
    (state?: EditorState) => {
      if (state) latestStateRef.current = state;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
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
      }, CHANGE_DEBOUNCE_MS);
    },
    [commit],
  );

  // Uploads `file` (validating against policy), records it as a tracked
  // attachment, and resolves the stored `cnst.File`. Shared by the slash menu,
  // drop/paste, and any future media insert path via the upload context.
  const uploadFile = useCallback(
    async (file: File, acceptOverride?: string): Promise<cnst.File> => {
      if (!addFilesGql) throw new Err("shared.error.fileUploadNotConfigured");
      const activePolicy = acceptOverride ? { ...policy, accept: acceptOverride } : policy;
      validateUploadFile(file, activePolicy, attachmentsRef.current.length);
      const uploaded = (await addFileUntilActive(file, addFilesGql)) as cnst.File;
      if (addFileRef.current) await addFileRef.current(uploaded);
      onAttachmentAddRef.current?.(uploaded);
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
      onError: (error) => onUploadErrorRef.current?.(error),
    }),
    [editable, addFilesGql, policy, uploadFile],
  );

  // Flush any pending change on unmount so the last edit is never dropped.
  useEffect(() => () => flush(), [flush]);

  // The drag handle is pinned to the editor's left edge, so the editable area
  // carries a matching left gutter for it to sit in without overlapping text.
  const showHandle = editable && blockActions;

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorUploadProvider value={uploadValue}>
        <AgentFieldPlugin
          name={editable ? (agentName ?? null) : null}
          blocks={agentBlocks}
          features={pluginFeatures}
          flush={flush}
        >
          <div ref={setAnchorElem} className={cn("akan-editor relative w-full", className)}>
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={cn("leading-7 outline-none", showHandle && "pl-2")}
                  aria-placeholder={placeholder}
                  placeholder={
                    <div
                      className={cn(
                        "pointer-events-none absolute top-2 select-none text-foreground/40",
                        showHandle ? "left-7" : "left-0",
                      )}
                    >
                      {placeholder}
                    </div>
                  }
                  style={{ minHeight: editable ? (height ?? "8rem") : undefined }}
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <HistoryPlugin />
            <ListPlugin />
            <CheckListPlugin />
            <LinkPlugin validateUrl={validateLinkUrl} />
            <AutoLinkPlugin />
            <HorizontalRulePlugin />
            <TabIndentationPlugin />
            <CodeHighlightPlugin />
            {markdown ? <MarkdownShortcutPlugin transformers={AKAN_TRANSFORMERS} /> : null}
            <TablePlugin hasCellMerge hasCellBackgroundColor />
            <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
            <FlushOnBlurPlugin onBlur={flush} />
            <ExternalValuePlugin value={value} />
            <AgentRichPlugin />
            <AgentMentionPlugin sources={mentionSources} />
            <EditableSyncPlugin editable={editable} />
            <MentionLinkPlugin />
            {editable && slashMenu ? (
              <SlashMenuPlugin extraOptions={extraSlashOptions} mentionSources={mentionSources} />
            ) : null}
            {editable && mentionSources.length ? <MentionPlugin sources={mentionSources} /> : null}
            {editable && toolbar ? <FloatingToolbarPlugin /> : null}
            {editable && blockActions && anchorElem ? <DraggableBlockPlugin anchorElem={anchorElem} /> : null}
            {editable ? <CalloutPlugin /> : null}
            {editable ? <CollapsiblePlugin /> : null}
            {editable ? <TableActionsPlugin /> : null}
            {editable && addFilesGql ? <UploadPlugin /> : null}
            {editable ? plugins?.map((plugin, index) => <Fragment key={index}>{plugin.render?.()}</Fragment>) : null}
          </div>
        </AgentFieldPlugin>
      </EditorUploadProvider>
    </LexicalComposer>
  );
}
