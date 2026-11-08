"use client";
import { type cnst, Err, msg } from "@libs/shared/client";
import { addFileUntilActive } from "@libs/shared/webkit";
import type { ProtoFile } from "akanjs/constant";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { AddFile } from "./editor.type";
import type { EditorUpload } from "./UploadContext";
import { normalizeUploadPolicy, type UploadPolicy, validateUploadFile } from "./upload";

interface EditorUploadHostOptions {
  editable: boolean;
  addFilesGql?: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile?: AddFile;
  uploadPolicy?: UploadPolicy;
  onUploadError?: (error: Error) => void;
  attachmentsRef: { current: cnst.File[] };
  onAttachmentsChangeRef: { current: ((files: cnst.File[]) => void) | undefined };
}

export const useEditorUploadHost = ({
  editable,
  addFilesGql,
  addFile,
  uploadPolicy,
  onUploadError,
  attachmentsRef,
  onAttachmentsChangeRef,
}: EditorUploadHostOptions) => {
  const addFileRef = useRef(addFile);
  addFileRef.current = addFile;
  const onUploadErrorRef = useRef(onUploadError);
  const mountedRef = useRef(false);
  useEffect(() => {
    onUploadErrorRef.current = onUploadError;
  }, [onUploadError]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const policy = useMemo(() => normalizeUploadPolicy(uploadPolicy), [uploadPolicy]);

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

  return useMemo<EditorUpload>(
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
};
