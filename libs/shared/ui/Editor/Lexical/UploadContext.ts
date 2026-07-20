"use client";
import type { cnst } from "@libs/shared/client";
import { createContext, useContext } from "react";

import { DEFAULT_UPLOAD_POLICY, type UploadPolicy } from "./upload";

/**
 * The upload capability an editable editor exposes to its media nodes/plugins.
 *
 * `Editor.tsx` builds the concrete value from its `addFilesGql`/`addFile`/policy
 * props (see there for the tracking + attachment-reconcile logic) and provides
 * it; slash-menu media options, the `UploadPlugin` (drop/paste), and the embed
 * node read it via {@link useEditorUpload}. Read-only renders get the default
 * (`canUpload: false`), so nothing here ever fires without a configured host.
 */
export interface EditorUpload {
  /** Whether uploads are configured (`addFilesGql` present). Media options hide when false. */
  canUpload: boolean;
  policy: Required<UploadPolicy>;
  /** Uploads `file` (validating against policy), tracks it as an attachment, and resolves the stored `cnst.File`. */
  uploadFile: (file: File, acceptOverride?: string) => Promise<cnst.File>;
  /** Surfaced upload/validation error sink (defaults to no-op). */
  onError: (error: Error) => void;
}

const DEFAULT_UPLOAD: EditorUpload = {
  canUpload: false,
  policy: DEFAULT_UPLOAD_POLICY,
  uploadFile: () => Promise.reject(new Error("File upload is not configured.")),
  onError: () => {},
};

const EditorUploadContext = createContext<EditorUpload>(DEFAULT_UPLOAD);

export const EditorUploadProvider = EditorUploadContext.Provider;

/** Reads the ambient upload capability; safe (no-op) outside an editable editor. */
export const useEditorUpload = (): EditorUpload => useContext(EditorUploadContext);
