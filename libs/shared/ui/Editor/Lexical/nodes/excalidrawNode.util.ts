import { Err } from "@libs/shared/client";
import {
  $applyNodeReplacement,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { ExcalidrawNode } from "./ExcalidrawNode";
import type { MediaAlign } from "./shared.type";

export type ExcalidrawModule = typeof import("@excalidraw/excalidraw");

export interface ExcalidrawFileReference {
  id?: string;
  url?: string;
  dataURL?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface ExcalidrawScene {
  elements: readonly unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, ExcalidrawFileReference>;
}

export interface ExcalidrawPayload {
  scene?: ExcalidrawScene;
  preview?: string | null;
  width?: number;
  align?: MediaAlign;
  key?: NodeKey;
}

export type SerializedExcalidrawNode = Spread<
  { scene: ExcalidrawScene; preview: string | null; width: number; align: MediaAlign },
  SerializedLexicalNode
>;

/** The width (px) a "reset size" restores a drawing to. */
export const RESET_WIDTH = 650;

export const createEmptyExcalidrawScene = (): ExcalidrawScene => ({
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});

export const normalizeScene = (scene: ExcalidrawScene | undefined): ExcalidrawScene => ({
  elements: Array.isArray(scene?.elements) ? scene.elements : [],
  appState: scene?.appState ?? { viewBackgroundColor: "#ffffff" },
  files: scene?.files ?? {},
});

// Persist only the display-relevant slice of appState (dropping transient UI state).
export const pickAppState = (appState: Record<string, unknown>) => ({
  viewBackgroundColor: appState.viewBackgroundColor,
  theme: appState.theme,
  gridSize: appState.gridSize,
  gridStep: appState.gridStep,
  name: appState.name,
});

// Snapshot the scene to an SVG data URL. Keeps exportToSvg's intrinsic size so
// the <img> has a real aspect ratio (width-only resize then works like an image).
export const renderPreview = async (module: ExcalidrawModule, scene: ExcalidrawScene): Promise<string | null> => {
  if (scene.elements.length === 0) return null;
  const svg = await module.exportToSvg({
    elements: scene.elements as never[],
    appState: { ...scene.appState, exportWithDarkMode: false } as never,
    files: scene.files as never,
  });
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
};

// Uploads any inline (data URL) scene images, replacing them with hosted URLs so
// the serialized scene stays small and its files reconcile as attachments.
export const sanitizeSceneFiles = async (
  scene: ExcalidrawScene,
  uploadFile?: (file: File) => Promise<{ id: string; url: string; mimeType?: string }>,
): Promise<ExcalidrawScene> => {
  if (!scene.files) return scene;
  const nextFiles: Record<string, ExcalidrawFileReference> = {};
  for (const [id, file] of Object.entries(scene.files)) {
    if (typeof file.dataURL === "string" && file.dataURL.startsWith("data:")) {
      if (!uploadFile) throw new Err("shared.error.excalidrawUploadNotConfigured");
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

export const dataUrlToFile = (dataUrl: string, id: string): File => {
  const [meta, data] = dataUrl.split(",");
  const mimeType = /data:(.*?);base64/.exec(meta)?.[1] || "application/octet-stream";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], `${id}.${mimeType.split("/").pop() ?? "bin"}`, { type: mimeType });
};

export const $createExcalidrawNode = (payload: ExcalidrawPayload = {}): ExcalidrawNode =>
  $applyNodeReplacement(new ExcalidrawNode(payload));

export const $isExcalidrawNode = (node: LexicalNode | null | undefined): node is ExcalidrawNode =>
  node instanceof ExcalidrawNode;
