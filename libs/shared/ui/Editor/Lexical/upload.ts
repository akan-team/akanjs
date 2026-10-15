import { Err } from "@libs/shared/client";

/** What a field accepts as an upload, and which players its embeds may name. */
export interface UploadPolicy {
  accept?: string;
  maxFileSize?: number;
  maxFiles?: number;
  allowedEmbedProviders?: string[];
}

export const defaultUploadPolicy: Required<UploadPolicy> = {
  accept: "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip",
  maxFileSize: 1024 * 1024 * 100,
  maxFiles: 30,
  allowedEmbedProviders: ["youtube", "vimeo"],
};

export const normalizeUploadPolicy = (policy?: UploadPolicy): Required<UploadPolicy> => ({
  ...defaultUploadPolicy,
  ...policy,
});

/** Throws a typed `Err` when `file` breaks `policy`; `accept` narrows the host's own list, never widens it. */
export const validateUploadFile = (
  file: File,
  policy: Required<UploadPolicy>,
  currentFileCount = 0,
  accept?: string,
): void => {
  if (currentFileCount >= policy.maxFiles) {
    throw new Err("shared.error.tooManyFiles", { maxFiles: policy.maxFiles });
  }
  if (file.size > policy.maxFileSize) {
    throw new Err("shared.error.fileTooLarge", { maxSize: Math.round(policy.maxFileSize / 1024 / 1024) });
  }
  if (!isAcceptedFile(file, policy.accept) || (accept !== undefined && !isAcceptedFile(file, accept))) {
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
