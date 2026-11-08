"use client";
import { type cnst, fetch, msg } from "@libs/shared/client";
import { Upload } from "@libs/util/ui";
import { cn } from "akanjs/client";
import type { ProtoLightFile } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";
import { formUploadOf, useFieldTool, useFileFieldTool } from "akanjs/store";
import { Field as AkanField } from "akanjs/ui";
import { useInterval } from "akanjs/webkit";
import type { ReactNode } from "react";

import { filesOf, replaced, uploaderOf } from "./field.util";

const useUploadPoll = <T extends cnst.LightFile>(files: T[], onUpdate: (updatedFiles: T[]) => void) => {
  useInterval(async () => {
    const uploadingFiles = files.filter((file) => file.status === "uploading");
    if (!uploadingFiles.length) return;
    onUpdate(await Promise.all(uploadingFiles.map(async (file) => (await fetch.file(file.id)) as unknown as T)));
  }, 1000);
};

interface ImgProps<T extends cnst.LightFile> {
  label?: string;
  desc?: string;
  styleType?: "circle" | "square";
  layout?: "stack" | "inline";
  labelClassName?: string;
  uploadClassName?: string;
  className?: string;
  nullable?: boolean;
  slice: SliceMeta;
  value: T | null;
  onChange: (file: T | null) => void;
  /**
   * 대화가 이 칸에 넣을 수 있는 그림. 넘기지 않으면 에이전트 도구가 아예 안 선다 — 후보가 없는 칸에
   * 모든 id 를 거절하는 도구가 서면 안 된다(`useFileFieldTool`).
   */
  read?: () => readonly T[];
  disabled?: boolean;
  aspectRatio?: number[];
}
export const Img = <T extends cnst.LightFile = cnst.File>({
  label,
  desc,
  styleType = "circle",
  layout,
  labelClassName,
  uploadClassName,
  className,
  nullable,
  value,
  slice,
  onChange,
  read,
  disabled,
  aspectRatio,
}: ImgProps<T>) => {
  useFieldTool(onChange, { disabled });
  useFileFieldTool(onChange, { read, label: (file) => file.filename, disabled });
  const upload = uploaderOf<T>(slice);
  const formUpload = formUploadOf(onChange);
  useUploadPoll(value ? [value] : [], (updatedFiles) =>
    formUpload ? formUpload.refresh(updatedFiles) : onChange(updatedFiles[0] ?? value),
  );
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Upload.Image
        className={uploadClassName}
        type="image"
        styleType={styleType}
        layout={layout}
        aspectRatio={aspectRatio}
        protoFile={value}
        disabled={disabled}
        onSave={async (file) => {
          if (formUpload) return await formUpload.upload(filesOf(file));
          const [uploadedFile] = await upload(file);
          onChange(uploadedFile ?? null);
        }}
        onRemove={() => {
          onChange(null);
        }}
      />
    </div>
  );
};

interface ImgsProps<T extends cnst.LightFile> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  slice: SliceMeta;
  render?: (file: T) => ReactNode;
  value: T[];
  onChange: (files: T[]) => void;
  /**
   * 대화가 이 칸에 넣을 수 있는 그림. 넘기지 않으면 에이전트 도구가 아예 안 선다 — 후보가 없는 칸에
   * 모든 id 를 거절하는 도구가 서면 안 된다(`useFileFieldTool`).
   */
  read?: () => readonly T[];
  disabled?: boolean;
  minlength?: number;
  maxlength?: number;
}

export const Imgs = <T extends cnst.LightFile = cnst.File>({
  className,
  label,
  desc,
  labelClassName,
  render,
  value,
  onChange,
  slice,
  read,
  minlength,
  maxlength,
  disabled,
}: ImgsProps<T>) => {
  useFieldTool(onChange, { disabled });
  useFileFieldTool(onChange, { read, label: (file) => file.filename, min: minlength, max: maxlength, disabled });
  const upload = uploaderOf<T>(slice);
  const formUpload = formUploadOf(onChange);
  useUploadPoll(value, (updatedFiles) =>
    formUpload ? formUpload.refresh(updatedFiles) : onChange(replaced(value, updatedFiles)),
  );
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={!minlength} label={label} desc={desc} /> : null}
      <Upload.Images
        multiple
        fileList={value}
        disabled={disabled}
        maxCount={maxlength}
        render={render as unknown as (file: ProtoLightFile) => ReactNode}
        styleType="square"
        onRemove={(file: File | FileList) => {
          onChange(value.filter((f) => f.id !== (file as unknown as ProtoLightFile).id));
        }}
        onSave={async (file) => {
          const files = filesOf(file);
          if (maxlength !== undefined && value.length + files.length > maxlength) {
            msg.warning("file.maxFilesExceeded", { data: { max: maxlength } });
            return;
          }
          if (formUpload) return await formUpload.upload(files);
          onChange([...value, ...(await upload(files))]);
        }}
      />
    </div>
  );
};

interface FileProps<T extends cnst.LightFile> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  uploadClassName?: string;
  render?: (file: T) => ReactNode;
  slice: SliceMeta;
  nullable?: boolean;
  value: T | null;
  onChange: (file: T | null) => void;
  disabled?: boolean;
  accept?: string;
}
export const File = <T extends cnst.LightFile = cnst.File>({
  label,
  desc,
  labelClassName,
  uploadClassName,
  className,
  render,
  nullable,
  value,
  onChange,
  slice,
  disabled,
  accept,
}: FileProps<T>) => {
  useFieldTool(onChange, { disabled });
  const upload = uploaderOf<T>(slice);
  const formUpload = formUploadOf(onChange);
  useUploadPoll(value ? [value] : [], (updatedFiles) =>
    formUpload ? formUpload.refresh(updatedFiles) : onChange(updatedFiles[0] ?? value),
  );
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
      <Upload.File
        render={render as unknown as (file: ProtoLightFile) => ReactNode}
        uploadClassName={uploadClassName}
        disabled={disabled}
        accept={accept}
        file={value}
        onRemove={() => {
          onChange(null);
        }}
        onChange={async (file) => {
          if (formUpload) return await formUpload.upload(filesOf(file));
          const [uploadedFile] = await upload(file);
          onChange(uploadedFile ?? null);
        }}
      />
    </div>
  );
};

interface FilesProps<T extends cnst.LightFile> {
  label?: string;
  desc?: string;
  labelClassName?: string;
  className?: string;
  slice: SliceMeta;
  render?: (file: T) => ReactNode;
  value: T[];
  onChange: (files: T[]) => void;
  disabled?: boolean;
  minlength?: number;
  maxlength?: number;
}

export const Files = <T extends cnst.LightFile = cnst.File>({
  className,
  label,
  desc,
  labelClassName,
  render,
  value,
  onChange,
  slice,
  minlength,
  maxlength = 30,
  disabled,
}: FilesProps<T>) => {
  useFieldTool(onChange, { disabled });
  const upload = uploaderOf<T>(slice);
  const formUpload = formUploadOf(onChange);
  useUploadPoll(value, (updatedFiles) =>
    formUpload ? formUpload.refresh(updatedFiles) : onChange(replaced(value, updatedFiles)),
  );
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? <AkanField.Label className={labelClassName} nullable={!minlength} label={label} desc={desc} /> : null}
      <Upload.FileList
        multiple
        disabled={disabled}
        maxCount={maxlength}
        render={render as unknown as (file: ProtoLightFile) => ReactNode}
        fileList={value}
        onRemove={(file: ProtoLightFile) => {
          onChange(value.filter((f) => f.id !== file.id));
        }}
        onChange={async (file) => {
          const files = filesOf(file);
          if (value.length + files.length > maxlength) {
            msg.warning("file.maxFilesExceeded", { data: { max: maxlength } });
            return;
          }
          if (formUpload) return await formUpload.upload(files);
          onChange([...value, ...(await upload(files))]);
        }}
      />
    </div>
  );
};
