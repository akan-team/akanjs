"use client";

import { type SlateElement, YooptaPlugin } from "@yoopta/editor";
import { AiOutlineEdit } from "react-icons/ai";

import { ExcalidrawElement } from "./ExcalidrawElement";

export interface ExcalidrawFileReference {
  id?: string;
  url?: string;
  dataURL?: string;
  mimeType?: string;
  created?: number;
  lastRetrieved?: number;
  [key: string]: unknown;
}

export interface ExcalidrawScene {
  elements: readonly unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, ExcalidrawFileReference>;
}

export interface ExcalidrawElementProps {
  nodeType: "void";
  scene: ExcalidrawScene;
  preview?: string | null;
  height?: number;
  updatedAt?: number;
}

export interface ExcalidrawUploadResult {
  id: string;
  url: string;
  mimeType?: string;
}

export interface ExcalidrawPluginOptions {
  uploadFile?: (file: File) => Promise<ExcalidrawUploadResult>;
  onUploadError?: (error: Error) => void;
}

export const createEmptyExcalidrawScene = (): ExcalidrawScene => ({
  elements: [],
  appState: {
    viewBackgroundColor: "#ffffff",
  },
  files: {},
});

type ExcalidrawElementMap = Record<"excalidraw", SlateElement<"excalidraw", ExcalidrawElementProps>>;

export const ExcalidrawPlugin = new YooptaPlugin<ExcalidrawElementMap, ExcalidrawPluginOptions>({
  type: "Excalidraw",
  elements: {
    excalidraw: {
      render: ExcalidrawElement,
      props: {
        nodeType: "void",
        scene: createEmptyExcalidrawScene(),
        preview: null,
        height: 420,
        updatedAt: 0,
      } satisfies ExcalidrawElementProps,
    },
  },
  options: {
    shortcuts: ["excalidraw", "draw", "diagram"],
    display: {
      title: "Excalidraw",
      description: "Draw a diagram",
      icon: <AiOutlineEdit />,
    },
  },
});
