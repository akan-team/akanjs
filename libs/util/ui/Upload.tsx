"use client";
import { usePage } from "@libs/util/client";
import { cn } from "akanjs/client";
import type { ProtoLightFile } from "akanjs/constant";
import type { ReactNode } from "react";
import { BiFile, BiLoaderAlt, BiTrash } from "react-icons/bi";

import { formatBytes } from "../common/formatBytes";
import { useFileDrop } from "../webkit/useFileDrop";
import { badgeRecipe, buttonRecipe, tableRecipe } from "./Recipe";
import { UploadImage, UploadImages } from "./UploadImage";
import { EmptyUpload, Progress, warnUploadRejected } from "./UploadParts";

const uploadStatusKeys = {
  active: "util.uploadStatusActive",
  uploading: "util.uploadStatusUploading",
  failed: "util.uploadStatusFailed",
} as const;

interface UploadProps {
  className?: string;
  onChange?: (fileList: FileList) => void;
  multiple?: boolean;
  accept?: string;
  children: ReactNode;
  disabled?: boolean;
}

export const Upload = ({ className, onChange, multiple, accept, children, disabled }: UploadProps) => {
  const { inputRef, openPicker, onInputChange } = useFileDrop({
    accept,
    multiple,
    disabled,
    onFiles: (files) => onChange?.(files),
  });
  if (disabled) return <>{children}</>;
  return (
    <div className={className} onClick={openPicker}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={onInputChange}
      />
      {children}
    </div>
  );
};

interface FileProps {
  className?: string;
  uploadClassName?: string;
  file: ProtoLightFile | null;
  render?: (file: ProtoLightFile) => ReactNode;
  onChange?: (e: File | FileList) => void | Promise<void>;
  onRemove?: (file: ProtoLightFile) => void;
  disabled?: boolean;
  accept?: string;
}

export const File = ({ className, uploadClassName, file, render, onChange, onRemove, disabled, accept }: FileProps) => {
  const { l } = usePage();
  const isUploading = file?.status === "uploading";
  const { isDragging, inputRef, openPicker, onInputChange, dropProps } = useFileDrop({
    accept,
    disabled: disabled || isUploading,
    onFiles: (files) => {
      const picked = files.item(0);
      if (picked) void onChange?.(picked);
    },
    onReject: warnUploadRejected,
  });

  return (
    <div className={cn("relative flex flex-wrap gap-2", className)}>
      <input ref={inputRef} type="file" className="hidden" accept={accept} onChange={onInputChange} />
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        {...dropProps}
        className={cn(
          buttonRecipe({ variant: "default" }, "group relative flex size-full flex-col items-center border-2 py-5"),
          uploadClassName,
          isDragging && !isUploading && "border-2 border-success border-dashed",
          isUploading && "hover:bg-muted",
          file?.id && "bg-background",
        )}
      >
        {file?.id ? (
          render ? (
            render(file)
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <BiFile className="text-5xl" />
              <div className="text-sm">{file.filename}</div>
            </div>
          )
        ) : (
          <EmptyUpload
            isDragging={isDragging}
            type="file"
            desc={l("util.uploadFileClick")}
            dndDesc={l("util.uploadFileDrop")}
          />
        )}
        {isUploading ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-box backdrop-blur-lg">
            <div className="flex w-[30%] flex-col items-center justify-center gap-2">
              <BiLoaderAlt className="animate-spin text-lg" />
              <Progress value={file.progress ?? 0} max={100} />
            </div>
          </div>
        ) : null}
      </button>
      {file?.id && onRemove && !disabled && !isUploading ? (
        <button
          type="button"
          aria-label={l("base.remove")}
          className={buttonRecipe(
            { size: "xs", variant: "destructive", shape: "square", outline: true },
            "absolute top-2 right-2",
          )}
          onClick={() => onRemove(file)}
        >
          <BiTrash />
        </button>
      ) : null}
    </div>
  );
};

Upload.File = File;

interface FileListProps {
  className?: string;
  uploadClassName?: string;
  multiple?: boolean;
  fileList?: ProtoLightFile[];
  render?: (file: ProtoLightFile) => ReactNode;
  onChange?: (e: File | File[]) => void | Promise<void>;
  onRemove?: (file: ProtoLightFile) => void;
  disabled?: boolean;
  maxCount?: number;
  accept?: string;
}

export const FileList = ({
  className,
  uploadClassName,
  multiple,
  fileList = [],
  render,
  onChange,
  onRemove,
  disabled,
  maxCount,
  accept,
}: FileListProps) => {
  const { l } = usePage();
  const remaining = maxCount === undefined ? undefined : Math.max(0, maxCount - fileList.length);
  const canAdd = !disabled && remaining !== 0;
  const { isDragging, inputRef, openPicker, onInputChange, dropProps } = useFileDrop({
    accept,
    multiple,
    limit: remaining,
    disabled: !canAdd,
    onFiles: (files) => {
      const first = files.item(0);
      //? Several files stay a FileList: Field.Files tells a multi-pick apart with `instanceof FileList`.
      if (files.length > 1) void onChange?.(files as unknown as File[]);
      else if (first) void onChange?.(first);
    },
    onReject: warnUploadRejected,
  });

  return (
    <>
      <div className={cn("relative flex size-full flex-wrap gap-2", className)} {...dropProps}>
        {fileList.length > 0 ? (
          <div
            className={cn(
              "relative size-full rounded-box border-2 border-border duration-200",
              isDragging && "border-2 border-success border-dashed",
            )}
          >
            <div className="relative size-full overflow-x-auto">
              <table className={tableRecipe({}, "size-full")}>
                <tbody className="w-full">
                  <tr className="w-full">
                    <td className="w-[70%] font-semibold text-sm md:w-[50%] md:text-base">
                      {l("util.uploadFileName")}
                    </td>
                    <td className="text-center font-semibold text-sm md:text-base">{l("util.uploadFileSize")}</td>
                    <td className="text-center font-semibold text-sm md:text-base">{l("util.uploadFileStatus")}</td>
                    <td className="text-center font-semibold text-sm md:text-base">-</td>
                  </tr>
                  {fileList.map((file) => {
                    const isUploading = file.status === "uploading";
                    const statusKey = uploadStatusKeys[file.status as keyof typeof uploadStatusKeys];
                    return (
                      <tr key={file.id} className={cn(isUploading ? "opacity-50" : "opacity-100")}>
                        <td className="w-[70%] truncate text-xs md:w-[50%] md:text-sm">
                          {render ? render(file) : file.filename}
                        </td>
                        <td className="text-center text-xs md:text-sm">{formatBytes(file.size)}</td>
                        <td className="text-center align-middle text-xs md:text-sm">
                          <div className={badgeRecipe({ variant: "info" }, "gap-1")}>
                            {statusKey ? l(statusKey) : file.status}
                            {isUploading ? <BiLoaderAlt className="size-3 animate-spin" /> : null}
                          </div>
                        </td>
                        <td className="text-center align-middle text-sm">
                          {onRemove && !disabled ? (
                            <button
                              type="button"
                              aria-label={l("base.remove")}
                              className={buttonRecipe({
                                size: "xs",
                                variant: "destructive",
                                shape: "square",
                                outline: true,
                              })}
                              onClick={() => onRemove(file)}
                            >
                              <BiTrash />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {canAdd ? (
              <div className="mx-2 border-border border-t-2 p-4">
                <button
                  type="button"
                  onClick={openPicker}
                  className={buttonRecipe({ variant: "outline" }, "w-full px-2")}
                >
                  {l("util.uploadFilesClick")}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            disabled={!canAdd}
            onClick={openPicker}
            className={cn(
              buttonRecipe({ variant: "default" }, "group flex size-full flex-col items-center border-2 py-5"),
              uploadClassName,
              isDragging && "border-2 border-success border-dashed",
            )}
          >
            <EmptyUpload
              isDragging={isDragging}
              type="fileList"
              desc={l("util.uploadFilesClick")}
              dndDesc={l("util.uploadFilesDrop")}
            />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={onInputChange}
      />
    </>
  );
};

Upload.FileList = FileList;

Upload.Image = UploadImage;

Upload.Images = UploadImages;
