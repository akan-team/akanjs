import type { cnst } from "@libs/shared/client";
import type { EditorContent } from "@libs/shared/common";
import type { ProtoFile } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import type { EditorPlugin } from "./Editor";
import type { UploadPolicy } from "./Editor/Lexical/upload";

export interface RichProps {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  slice: SliceMeta;
  valuePath: string;
  value?: unknown;
  onChange: (value: EditorContent) => void;
  addFile: (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => void;
  addFilesGql?: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  attachments?: cnst.File[];
  onAttachmentsChange?: (files: cnst.File[]) => void;
  onUploadError?: (error: Error) => void;
  uploadPolicy?: UploadPolicy;
  toolbar?: boolean;
  blockActions?: boolean;
  slashMenu?: boolean;
  markdown?: boolean;
  placeholder?: string;
  nullable?: boolean;
  disabled?: boolean;
  onPressEnter?: () => void;
  editorHeight?: string;
  plugins?: EditorPlugin[];
  /** Names the agent tool when `onChange` is not a store setter — a local `useState` carries no action tag. */
  agentName?: string | null;
  /** Publish the block read/edit pair too, default on. Turn off for a field too short to address by block. */
  agentBlocks?: boolean;
}
