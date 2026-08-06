import { Err } from "@libs/shared/client";

/**
 * Framework-independent upload policy + validation, ported (near-verbatim) from
 * the Yoopta `Upload.ts`. These rules describe *what* may be uploaded; the
 * actual transport (`addFilesGql` → `addFileUntilActive`) is wired by
 * `Editor.tsx` and exposed to nodes/plugins through the upload context. Embed
 * provider resolution lives in the pure `./embed` module.
 */
export interface UploadPolicy {
  accept?: string;
  maxFileSize?: number;
  maxFiles?: number;
  allowedEmbedProviders?: string[];
}

export const DEFAULT_UPLOAD_POLICY: Required<UploadPolicy> = {
  accept: "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip",
  maxFileSize: 1024 * 1024 * 100,
  maxFiles: 30,
  allowedEmbedProviders: ["youtube", "vimeo"],
};

export const normalizeUploadPolicy = (policy?: UploadPolicy): Required<UploadPolicy> => ({
  ...DEFAULT_UPLOAD_POLICY,
  ...policy,
});

/** Throws a typed `Err` (dict keys in `shared.dictionary`) when `file` violates `policy`. */
export const validateUploadFile = (file: File, policy: Required<UploadPolicy>, currentFileCount = 0): void => {
  if (currentFileCount >= policy.maxFiles) {
    throw new Err("shared.error.tooManyFiles", { maxFiles: policy.maxFiles });
  }
  if (file.size > policy.maxFileSize) {
    throw new Err("shared.error.fileTooLarge", { maxSize: Math.round(policy.maxFileSize / 1024 / 1024) });
  }
  if (!isAcceptedFile(file, policy.accept)) {
    throw new Err("shared.error.fileTypeNotAllowed", { fileType: file.type || file.name });
  }
};

/** `true` when `file` matches an `accept` entry (mime `type/*`, exact mime, or `.ext`). */
export const isAcceptedFile = (file: File, accept: string): boolean => {
  if (!accept.trim()) return true;
  const extension = `.${file.name.split(".").pop() ?? ""}`.toLowerCase();
  return accept.split(",").some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) return false;
    if (pattern.endsWith("/*")) return file.type.toLowerCase().startsWith(pattern.slice(0, -1));
    if (pattern.startsWith(".")) return pattern === extension;
    return pattern === file.type.toLowerCase();
  });
};
