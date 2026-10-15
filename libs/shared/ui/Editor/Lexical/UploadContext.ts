"use client";
import { type cnst, Err } from "@libs/shared/client";
import { createContext, useContext } from "react";

import { defaultUploadPolicy, type UploadPolicy } from "./upload";

/**
 * The upload capability an editable editor exposes to its media nodes and plugins. Read-only renders get the
 * default (`canUpload: false`), so nothing here fires without a configured host.
 */
export interface EditorUpload {
  /** Whether uploads are configured (`addFilesGql` present). Media options hide when false. */
  canUpload: boolean;
  policy: Required<UploadPolicy>;
  /**
   * Uploads `file` and tracks it as an attachment. Resolves `null` when the editor unmounted meanwhile, since
   * the file then belongs to no form that is still open.
   */
  uploadFile: (file: File, accept?: string) => Promise<cnst.File | null>;
  onError: (error: Error) => void;
}

const defaultUpload: EditorUpload = {
  canUpload: false,
  policy: defaultUploadPolicy,
  uploadFile: () => Promise.reject(new Err("shared.error.fileUploadNotConfigured")),
  onError: () => {},
};

const EditorUploadContext = createContext<EditorUpload>(defaultUpload);

export const EditorUploadProvider = EditorUploadContext.Provider;

export const useEditorUpload = (): EditorUpload => useContext(EditorUploadContext);
