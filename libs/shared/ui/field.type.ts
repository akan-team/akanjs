import type { cnst } from "@libs/shared/client";
import type { ProtoFile } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import type { UploadPolicy } from "./Editor/Lexical/upload";

export interface RichProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  slice: SliceMeta;
  valuePath: string;
  value?: unknown;
  onChange: (value: unknown) => void;
  addFile: (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => void;
  addFilesGql?: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  attachments?: cnst.File[];
  onAttachmentsChange?: (files: cnst.File[]) => void;
  onUploadError?: (error: Error) => void;
  uploadPolicy?: UploadPolicy;
  toolbar?: boolean;
  blockActions?: boolean;
  slashMenu?: boolean;
  placeholder?: string;
  nullable?: boolean;
  disabled?: boolean;
  onPressEnter?: () => void;
  editorHeight?: string;
}
