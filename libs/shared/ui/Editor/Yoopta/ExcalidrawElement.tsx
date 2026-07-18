"use client";

import {
  type PluginElementRenderProps,
  useYooptaEditor,
  useYooptaPluginOptions,
  useYooptaReadOnly,
} from "@yoopta/editor";
import { clsx } from "akanjs/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AiOutlineCompress, AiOutlineDelete, AiOutlineEdit, AiOutlineExpand, AiOutlineReload } from "react-icons/ai";

import {
  createEmptyExcalidrawScene,
  type ExcalidrawElementProps,
  type ExcalidrawFileReference,
  type ExcalidrawPluginOptions,
  type ExcalidrawScene,
} from "./ExcalidrawPlugin";

type ExcalidrawModule = typeof import("@excalidraw/excalidraw");

export const ExcalidrawElement = ({ attributes, children, element, blockId }: PluginElementRenderProps) => {
  const editor = useYooptaEditor();
  const readOnly = useYooptaReadOnly();
  const options = useYooptaPluginOptions<ExcalidrawPluginOptions>("Excalidraw");
  const props = element.props as ExcalidrawElementProps;
  const scene = normalizeScene(props.scene);
  const height = props.height ?? 420;
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<ExcalidrawModule | null>(null);
  const [preview, setPreview] = useState<string | null>(props.preview ?? null);
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
      setPreview(props.preview ?? null);
      return;
    }

    let cancelled = false;
    void renderPreview(module, scene).then((nextPreview) => {
      if (!cancelled) setPreview(nextPreview);
    });
    return () => {
      cancelled = true;
    };
  }, [module, props.preview, scene]);

  const updateProps = useCallback(
    (nextProps: Partial<ExcalidrawElementProps>) => {
      editor.updateElement({
        blockId,
        type: "excalidraw",
        props: {
          ...props,
          ...nextProps,
        },
      });
    },
    [blockId, editor, props],
  );

  const saveScene = useCallback(async () => {
    try {
      const sanitizedScene = await sanitizeSceneFiles(latestSceneRef.current, options.uploadFile);
      const nextPreview = module ? await renderPreview(module, sanitizedScene) : null;
      updateProps({
        scene: sanitizedScene,
        preview: nextPreview,
        updatedAt: Date.now(),
      });
      setPreview(nextPreview);
      setOpen(false);
    } catch (error) {
      options.onUploadError?.(error as Error);
    }
  }, [module, options, updateProps]);

  const resetScene = () => {
    latestSceneRef.current = createEmptyExcalidrawScene();
    updateProps({ scene: latestSceneRef.current, preview: null, updatedAt: Date.now() });
    setPreview(null);
  };

  const resize = (delta: number) => {
    updateProps({ height: Math.max(240, Math.min(900, height + delta)) });
  };

  return (
    <div {...attributes} contentEditable={false} className="my-3 w-full">
      <div className="overflow-hidden rounded-xl border border-base-content/15 bg-base-100 shadow-sm">
        <div className="flex items-center justify-between border-base-content/10 border-b px-3 py-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AiOutlineEdit />
            Excalidraw
          </div>
          {!readOnly ? (
            <div className="flex items-center gap-1">
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => resize(-80)}>
                <AiOutlineCompress />
              </button>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => resize(80)}>
                <AiOutlineExpand />
              </button>
              <button type="button" className="btn btn-xs btn-ghost" onClick={resetScene}>
                <AiOutlineReload />
              </button>
              <button type="button" className="btn btn-xs btn-primary" onClick={() => setOpen(true)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-xs btn-error btn-ghost"
                onClick={() => editor.deleteBlock({ blockId })}
              >
                <AiOutlineDelete />
              </button>
            </div>
          ) : null}
        </div>
        <div
          className={clsx("flex w-full items-center justify-center bg-base-200/30", {
            "cursor-pointer": !readOnly,
          })}
          style={{ minHeight: height }}
          onClick={() => {
            if (!readOnly) setOpen(true);
          }}
        >
          {preview ? (
            <img className="max-h-full w-full object-contain p-4" src={preview} alt="Excalidraw preview" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-base-content/50">
              <AiOutlineEdit className="text-4xl" />
              <span>{readOnly ? "No drawing" : "Click Edit to draw"}</span>
            </div>
          )}
        </div>
      </div>
      {open ? (
        <ExcalidrawModal
          module={module}
          scene={scene}
          height={height}
          onChange={(nextScene) => {
            latestSceneRef.current = nextScene;
          }}
          onCancel={() => setOpen(false)}
          onSave={() => void saveScene()}
        />
      ) : null}
      {children}
    </div>
  );
};

interface ExcalidrawModalProps {
  module: ExcalidrawModule | null;
  scene: ExcalidrawScene;
  height: number;
  onChange: (scene: ExcalidrawScene) => void;
  onCancel: () => void;
  onSave: () => void;
}
const ExcalidrawModal = ({ module, scene, height, onChange, onCancel, onSave }: ExcalidrawModalProps) => {
  const Excalidraw = module?.Excalidraw;

  return (
    <div className="fixed inset-0 z-9999 flex flex-col bg-base-100 text-base-content">
      <div className="flex items-center justify-between border-base-content/10 border-b px-4 py-3">
        <div className="font-semibold">Edit Excalidraw</div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {Excalidraw ? (
          <Excalidraw
            initialData={{
              elements: scene.elements as never[],
              appState: {
                ...scene.appState,
                height,
              },
              files: scene.files as never,
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
          <div className="flex size-full items-center justify-center text-base-content/50">Loading Excalidraw...</div>
        )}
      </div>
    </div>
  );
};

const normalizeScene = (scene: ExcalidrawScene | undefined): ExcalidrawScene => ({
  elements: Array.isArray(scene?.elements) ? scene.elements : [],
  appState: scene?.appState ?? { viewBackgroundColor: "#ffffff" },
  files: scene?.files ?? {},
});

const pickAppState = (appState: Record<string, unknown>) => ({
  viewBackgroundColor: appState.viewBackgroundColor,
  theme: appState.theme,
  gridSize: appState.gridSize,
  gridStep: appState.gridStep,
  name: appState.name,
});

const renderPreview = async (module: ExcalidrawModule, scene: ExcalidrawScene) => {
  if (scene.elements.length === 0) return null;
  const svg = await module.exportToSvg({
    elements: scene.elements as never[],
    appState: {
      ...scene.appState,
      exportWithDarkMode: false,
    } as never,
    files: scene.files as never,
  });
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
};

const sanitizeSceneFiles = async (
  scene: ExcalidrawScene,
  uploadFile?: (file: File) => Promise<{ id: string; url: string; mimeType?: string }>,
): Promise<ExcalidrawScene> => {
  if (!scene.files) return scene;

  const nextFiles: Record<string, ExcalidrawFileReference> = {};
  for (const [id, file] of Object.entries(scene.files)) {
    if (typeof file.dataURL === "string" && file.dataURL.startsWith("data:")) {
      if (!uploadFile) throw new Error("Excalidraw image upload is not configured.");
      const uploaded = await uploadFile(dataUrlToFile(file.dataURL, id));
      nextFiles[id] = {
        ...file,
        id: uploaded.id,
        url: uploaded.url,
        dataURL: uploaded.url,
        mimeType: uploaded.mimeType ?? file.mimeType,
      };
    } else {
      nextFiles[id] = file;
    }
  }

  return { ...scene, files: nextFiles };
};

const dataUrlToFile = (dataUrl: string, id: string) => {
  const [meta, data] = dataUrl.split(",");
  const mimeType = /data:(.*?);base64/.exec(meta)?.[1] || "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], `${id}.${mimeType.split("/").pop() ?? "bin"}`, { type: mimeType });
};
