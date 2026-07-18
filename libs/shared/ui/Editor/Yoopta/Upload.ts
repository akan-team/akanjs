import type { cnst } from "@libs/shared/client";
import type { SlateElement, YooptaContentValue } from "@yoopta/editor";

export interface YooptaUploadPolicy {
  accept?: string;
  maxFileSize?: number;
  maxFiles?: number;
  allowedEmbedProviders?: string[];
}

export const DEFAULT_UPLOAD_POLICY: Required<YooptaUploadPolicy> = {
  accept: "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip",
  maxFileSize: 1024 * 1024 * 100,
  maxFiles: 30,
  allowedEmbedProviders: ["youtube", "vimeo"],
};

export const normalizeUploadPolicy = (policy?: YooptaUploadPolicy): Required<YooptaUploadPolicy> => ({
  ...DEFAULT_UPLOAD_POLICY,
  ...policy,
});

export const validateUploadFile = (file: File, policy: Required<YooptaUploadPolicy>, currentFileCount = 0) => {
  if (currentFileCount >= policy.maxFiles) {
    throw new Error(`You can attach up to ${policy.maxFiles} files.`);
  }

  if (file.size > policy.maxFileSize) {
    throw new Error(`File is too large. Maximum size is ${Math.round(policy.maxFileSize / 1024 / 1024)}MB.`);
  }

  if (!isAcceptedFile(file, policy.accept)) {
    throw new Error(`File type is not allowed: ${file.type || file.name}`);
  }
};

export const safeExternalUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const extractYooptaAttachmentIds = (content: unknown) => {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];

  const ids = new Set<string>();
  const blocks = Object.values(content as YooptaContentValue);
  blocks.forEach((block) => {
    block.value?.forEach((element) => {
      collectAttachmentIds(element as SlateElement, ids);
    });
  });

  return [...ids];
};

export const reconcileYooptaAttachments = (content: unknown, attachments: cnst.File[] = []) => {
  const ids = new Set(extractYooptaAttachmentIds(content));
  return attachments.filter((attachment) => ids.has(attachment.id));
};

const collectAttachmentIds = (element: SlateElement, ids: Set<string>) => {
  const fileId = typeof element.props?.id === "string" ? element.props.id : null;
  if (fileId && ["image", "video", "file"].includes(element.type)) ids.add(fileId);

  element.children?.forEach((child) => {
    if (child && typeof child === "object" && "type" in child) collectAttachmentIds(child as SlateElement, ids);
  });
};

const isAcceptedFile = (file: File, accept: string) => {
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
