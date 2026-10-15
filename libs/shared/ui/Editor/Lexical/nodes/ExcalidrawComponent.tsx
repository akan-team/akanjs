"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { Err, usePage } from "@libs/shared/client";
import { buttonRecipe } from "@libs/util/ui";
import type { NodeKey } from "lexical";
import type { SyntheticEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AiOutlineEdit, AiOutlineReload } from "react-icons/ai";
import { useEditorUpload } from "../UploadContext";
import {
  $isExcalidrawNode,
  createEmptyExcalidrawScene,
  type ExcalidrawFileReference,
  type ExcalidrawModule,
  type ExcalidrawScene,
  normalizeScene,
  pickAppState,
  renderPreview,
  sanitizeSceneFiles,
  toLoadableFiles,
  toStorableFiles,
} from "./excalidrawNode.util";
import { MediaFrame, MediaMenuButton } from "./shared";
import type { MediaAlign } from "./shared.type";
import { adoptByKey, mediaResetWidth, updateNodeByKey } from "./shared.util";

interface ExcalidrawComponentProps {
  nodeKey: NodeKey;
  scene: ExcalidrawScene;
  preview: string | null;
  width: number;
  align: MediaAlign;
}

export const ExcalidrawComponent = ({
  nodeKey,
  scene: rawScene,
  preview: initialPreview,
  width,
  align,
}: ExcalidrawComponentProps) => {
  const [editor] = useLexicalComposerContext();
  const { l } = usePage();
  const editable = useLexicalEditable();
  const upload = useEditorUpload();
  const scene = normalizeScene(rawScene);
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<ExcalidrawModule | null>(null);
  const [preview, setPreview] = useState<string | null>(initialPreview ?? null);
  const latestSceneRef = useRef<ExcalidrawScene>(scene);

  useEffect(() => {
    const id = "excalidraw-public-css";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "/libs/shared/excalidraw.css";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    let mounted = true;
    void import("@excalidraw/excalidraw").then((nextModule) => {
      if (mounted) setModule(nextModule);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    latestSceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    if (!module || scene.elements.length === 0) {
      setPreview(initialPreview ?? null);
      return;
    }
    let cancelled = false;
    void renderPreview(module, scene).then((nextPreview) => {
      if (!cancelled) setPreview(nextPreview);
    });
    return () => {
      cancelled = true;
    };
  }, [module, initialPreview, scene]);

  const setWidth = useCallback(
    (nextWidth: number, merge = false) =>
      updateNodeByKey(
        editor,
        nodeKey,
        (node) => {
          if ($isExcalidrawNode(node)) node.setWidth(nextWidth);
        },
        merge,
      ),
    [editor, nodeKey],
  );

  // The resize handles start from the drawing's own width, capped.
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (!editable || width) return;
    const { naturalWidth } = event.currentTarget;
    if (!naturalWidth) return;
    adoptByKey(
      editor,
      nodeKey,
      (node) => $isExcalidrawNode(node) && node.setWidth(Math.min(naturalWidth, mediaResetWidth)),
    );
  };

  const saveScene = useCallback(async () => {
    try {
      const uploadFn = upload.canUpload
        ? async (file: File) => {
            const uploaded = await upload.uploadFile(file);
            if (!uploaded) throw new Err("shared.error.fileUploadFailed");
            return { id: uploaded.id, url: uploaded.url, mimeType: uploaded.mimetype };
          }
        : undefined;
      const latest = latestSceneRef.current;
      const sanitized = await sanitizeSceneFiles({ ...latest, files: toStorableFiles(latest.files) }, uploadFn);
      const nextPreview = module ? await renderPreview(module, sanitized) : null;
      updateNodeByKey(editor, nodeKey, (node) => {
        if ($isExcalidrawNode(node)) {
          node.setScene(sanitized);
          node.setPreview(nextPreview);
        }
      });
      setPreview(nextPreview);
      setOpen(false);
    } catch (error) {
      upload.onError(error as Error);
    }
  }, [module, upload, editor, nodeKey]);

  const resetScene = () => {
    latestSceneRef.current = createEmptyExcalidrawScene();
    updateNodeByKey(editor, nodeKey, (node) => {
      if ($isExcalidrawNode(node)) {
        node.setScene(latestSceneRef.current);
        node.setPreview(null);
      }
    });
    setPreview(null);
  };

  return (
    <>
      <MediaFrame
        nodeKey={nodeKey}
        align={align}
        width={width}
        minWidth={160}
        onSetAlign={(nextAlign) =>
          updateNodeByKey(editor, nodeKey, (node) => {
            if ($isExcalidrawNode(node)) node.setAlign(nextAlign);
          })
        }
        onResize={(nextWidth) => setWidth(nextWidth, true)}
        onReset={() => setWidth(mediaResetWidth)}
        extraActions={
          editable ? (
            <>
              <MediaMenuButton title={l("shared.editor-edit")} onClick={() => setOpen(true)}>
                <AiOutlineEdit />
              </MediaMenuButton>
              <MediaMenuButton title={l("shared.editor-resetDrawing")} onClick={resetScene}>
                <AiOutlineReload />
              </MediaMenuButton>
            </>
          ) : null
        }
      >
        {preview ? (
          <img
            src={preview}
            alt={l("shared.editor-drawingAlt")}
            width={width || undefined}
            onLoad={onLoad}
            draggable={false}
            className="block h-auto max-w-full rounded-md"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (editable) setOpen(true);
            }}
            className="flex h-40 w-80 max-w-full flex-col items-center justify-center gap-2 rounded-md border border-foreground/20 border-dashed bg-muted/40 text-foreground/50"
          >
            <AiOutlineEdit className="text-3xl" />
            <span className="text-sm">{editable ? l("shared.editor-clickToDraw") : l("shared.editor-noDrawing")}</span>
          </button>
        )}
      </MediaFrame>
      {open ? (
        <ExcalidrawModal
          module={module}
          scene={scene}
          onChange={(nextScene) => {
            latestSceneRef.current = nextScene;
          }}
          onCancel={() => setOpen(false)}
          onSave={() => void saveScene()}
        />
      ) : null}
    </>
  );
};

interface ExcalidrawModalProps {
  module: ExcalidrawModule | null;
  scene: ExcalidrawScene;
  onChange: (scene: ExcalidrawScene) => void;
  onCancel: () => void;
  onSave: () => void;
}

export const ExcalidrawModal = ({ module, scene, onChange, onCancel, onSave }: ExcalidrawModalProps) => {
  const { l } = usePage();
  const Excalidraw = module?.Excalidraw;
  // Portal to <body> so the overlay is a true full-screen layer: a transformed
  // or overflow-clipped ancestor (editor card / page layout) would otherwise
  // trap `position: fixed` and shrink the modal, letting Excalidraw's own
  // toolbars cover the Save/Cancel header. Same pattern as CalloutPlugin.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background text-foreground">
      <div className="relative z-10 flex items-center justify-between border-foreground/10 border-b bg-background px-4 py-3">
        <div className="font-semibold">{l("shared.editor-editExcalidraw")}</div>
        <div className="flex gap-2">
          <button type="button" className={buttonRecipe({ size: "sm", variant: "ghost" })} onClick={onCancel}>
            {l("shared.editor-cancel")}
          </button>
          <button type="button" className={buttonRecipe({ size: "sm", variant: "primary" })} onClick={onSave}>
            {l("shared.editor-save")}
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {Excalidraw ? (
          <Excalidraw
            initialData={{
              elements: scene.elements as never[],
              appState: scene.appState as never,
              files: toLoadableFiles(scene.files) as never,
            }}
            onChange={(elements, appState, files) => {
              onChange({
                elements,
                appState: pickAppState(appState as unknown as Record<string, unknown>),
                files: files as unknown as Record<string, ExcalidrawFileReference>,
              });
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-foreground/50">
            {l("shared.editor-loadingExcalidraw")}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
