"use client";
import { msg, usePage } from "@libs/util/client";
import { cn, Device } from "akanjs/client";
import type { ProtoLightFile } from "akanjs/constant";
import { BottomSheet, type BottomSheetRef, Image } from "akanjs/ui";
import { useCamera } from "akanjs/webkit";
import { Fragment, type ReactNode, useRef, useState } from "react";
import { AiFillFileImage, AiFillFileText, AiOutlineDelete, AiOutlineLoading } from "react-icons/ai";
import { GiFiles } from "react-icons/gi";
import { TbDragDrop } from "react-icons/tb";

import { formatBytes } from "../common/formatBytes";
import { useFileDrop } from "../webkit/useFileDrop";
import { CropImage, type CropRef } from "./CropImage";
import { badgeRecipe, buttonRecipe, tableRecipe } from "./Recipe";

const imageAccept = "image/jpeg, image/png, image/gif, image/webp, image/avif";

const uploadStatusKeys = {
  active: "util.uploadStatusActive",
  uploading: "util.uploadStatusUploading",
  failed: "util.uploadStatusFailed",
} as const;

const warnRejected = () => {
  msg.warning("util.uploadTypeNotAllowed");
};

const readAsDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const fileFromDataUrl = async (dataUrl: string) => {
  const blob = await (await fetch(dataUrl)).blob();
  const extension = blob.type.split("/")[1] ?? "jpeg";
  return new globalThis.File([blob], `photo-${Date.now()}.${extension}`, { type: blob.type });
};

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
    onReject: warnRejected,
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
              <AiFillFileText className="text-[75px]" />
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
          <div className="absolute inset-0 flex items-center justify-center rounded-md backdrop-blur-lg">
            <div className="flex w-[30%] flex-col items-center justify-center gap-2">
              <AiOutlineLoading className="animate-spin text-info text-lg" />
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
          <AiOutlineDelete />
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
    onReject: warnRejected,
  });

  return (
    <>
      <div className={cn("relative flex size-full flex-wrap gap-2", className)} {...dropProps}>
        {fileList.length > 0 ? (
          <div
            className={cn(
              "relative size-full rounded-md border-2 border-border duration-200",
              isDragging && "border-2 border-success border-dashed",
            )}
          >
            <div className="relative size-full overflow-x-auto">
              <table className={tableRecipe({}, "size-full")}>
                <tbody className="w-full rounded-md">
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
                            {isUploading ? <AiOutlineLoading className="size-3 animate-spin" /> : null}
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
                              <AiOutlineDelete />
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

interface UploadImageProps {
  className?: string;
  wrapperClassName?: string;
  type: "image" | "crop";
  protoFile: ProtoLightFile | null;
  styleType: "circle" | "square";
  renderEmpty?: () => ReactNode;
  renderComplete?: (file: ProtoLightFile) => ReactNode;
  onSave: (file: File | FileList) => void | Promise<void>;
  onRemove: (file: File | FileList) => void;
  aspectRatio?: number[];
  disabled?: boolean;
  multiple?: boolean;
  maxCount?: number;
}

const UploadImage = ({
  className,
  wrapperClassName,
  type,
  protoFile,
  styleType,
  renderEmpty,
  renderComplete,
  onSave,
  onRemove,
  aspectRatio,
  disabled,
  multiple,
  maxCount,
}: UploadImageProps) => {
  const { l } = usePage();
  const { getPhoto } = useCamera();
  const bottomSheetRef = useRef<BottomSheetRef | null>(null);
  const cropImageRef = useRef<CropRef | null>(null);
  const [image, setImage] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const isUploading = protoFile?.status === "uploading";
  const isMultiple = type === "image" && !!multiple;
  const isLocked = !!disabled || isUploading || isSaving;
  const roundedClassName = styleType === "circle" ? "rounded-full" : "rounded-md";
  const { isDragging, inputRef, openPicker, onInputChange, dropProps } = useFileDrop({
    accept: imageAccept,
    multiple: isMultiple,
    limit: maxCount,
    disabled: isLocked,
    onFiles: (files) => {
      const first = files.item(0);
      if (!first) return;
      if (type === "crop") void readAsDataUrl(first).then(setImage);
      else void onSave(isMultiple ? files : first);
    },
    onReject: warnRejected,
  });

  const onSelectImage = async () => {
    if (isLocked) return;
    const device = await Device.getDevice();
    if (Object.keys(device.info).length === 0 || device.info.platform === "web") {
      openPicker();
      return;
    }
    const photo = await getPhoto();
    if (!photo?.dataUrl) return;
    if (type === "crop") setImage(photo.dataUrl);
    else await onSave(await fileFromDataUrl(photo.dataUrl));
  };

  const onCancel = () => {
    bottomSheetRef.current?.close();
    setImage(undefined);
  };

  const onSaveCropped = async () => {
    setIsSaving(true);
    try {
      const file = await cropImageRef.current?.getFileStream();
      if (!file) return;
      bottomSheetRef.current?.close();
      setImage(undefined);
      await onSave(file);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className={wrapperClassName}>
        <input
          ref={inputRef}
          type="file"
          accept={imageAccept}
          multiple={isMultiple}
          className="hidden"
          onChange={onInputChange}
        />
        {protoFile?.status === "active" ? (
          renderComplete ? (
            renderComplete(protoFile)
          ) : (
            <div className={cn("group relative flex size-56", className)}>
              <Image className={cn("bg-background object-cover px-0", roundedClassName)} file={protoFile} />
              {disabled ? null : (
                <button
                  type="button"
                  aria-label={l("base.remove")}
                  onClick={() => onRemove(protoFile as unknown as File)}
                  className={cn(
                    "group/remove absolute flex size-full flex-wrap items-center justify-center opacity-0 backdrop-blur-lg focus-visible:opacity-100 group-hover:animate-fadeIn",
                    roundedClassName,
                  )}
                >
                  <AiOutlineDelete className="text-3xl text-primary/0 transition duration-300 group-hover:text-destructive group-focus-visible/remove:text-destructive" />
                </button>
              )}
            </div>
          )
        ) : (
          <div className="relative flex w-full">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onSelectImage()}
              {...dropProps}
              className={cn("group aspect-1 size-56 bg-background px-0 duration-300", roundedClassName, className)}
            >
              <div
                className={cn(
                  buttonRecipe(
                    { variant: "default" },
                    "group relative flex size-full items-center justify-center md:text-lg",
                  ),
                  roundedClassName,
                  isDragging && "border-2 border-success border-dashed",
                )}
              >
                {renderEmpty ? (
                  renderEmpty()
                ) : (
                  <EmptyUpload
                    isDragging={isDragging}
                    type="image"
                    desc={l("util.uploadImageClick")}
                    dndDesc={l("util.uploadImageDrop")}
                  />
                )}
                {isUploading ? (
                  <div
                    className={cn(
                      "absolute top-0 left-0 z-[100] flex size-full flex-col items-center justify-center gap-2 bg-background/30 px-10 backdrop-blur-sm",
                      roundedClassName,
                    )}
                  >
                    <AiOutlineLoading className="animate-spin text-lg" />
                    <Progress value={protoFile.progress ?? 0} max={100} />
                  </div>
                ) : null}
              </div>
            </button>
          </div>
        )}
      </div>
      {type === "crop" ? (
        <BottomSheet type="full" ref={bottomSheetRef} onCancel={() => setImage(undefined)} open={!!image}>
          <CropImage aspectRatio={aspectRatio} ref={cropImageRef} src={image ?? ""} />
          <div className="flex w-full items-center justify-center gap-2">
            <button type="button" className={buttonRecipe({ variant: "default" }, "w-full")} onClick={onCancel}>
              {l("base.cancel")}
            </button>
            <button
              type="button"
              disabled={isSaving}
              className={buttonRecipe({ variant: "primary" }, "w-full")}
              onClick={() => void onSaveCropped()}
            >
              {isSaving ? <AiOutlineLoading className="animate-spin" /> : l("base.save")}
            </button>
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
};

Upload.Image = UploadImage;

interface UploadImagesProps {
  multiple?: boolean;
  fileList?: ProtoLightFile[];
  disabled?: boolean;
  maxCount?: number;
  styleType: "circle" | "square";
  render?: (file: ProtoLightFile) => ReactNode;
  onSave: (file: File | FileList) => void | Promise<void>;
  onRemove: (file: File | FileList) => void;
}

const UploadImages = ({
  multiple,
  fileList = [],
  disabled,
  maxCount,
  styleType,
  render,
  onSave,
  onRemove,
}: UploadImagesProps) => {
  const remaining = maxCount === undefined ? undefined : Math.max(0, maxCount - fileList.length);
  return (
    <div className="flex flex-wrap gap-2">
      {fileList.map((file) =>
        render ? (
          <Fragment key={file.id}>{render(file)}</Fragment>
        ) : (
          <UploadImage
            key={file.id}
            type="image"
            styleType={styleType}
            protoFile={file}
            disabled={disabled}
            onSave={onSave}
            onRemove={onRemove}
          />
        ),
      )}
      {!disabled && remaining !== 0 ? (
        <UploadImage
          type="image"
          styleType={styleType}
          protoFile={null}
          multiple={multiple}
          maxCount={remaining}
          onSave={onSave}
          onRemove={onRemove}
        />
      ) : null}
    </div>
  );
};

Upload.Images = UploadImages;

interface ProgressProps {
  value: number;
  max: number;
}

export const Progress = ({ value, max }: ProgressProps) => {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-xl">
      <div className="absolute size-full bg-primary/20" />
      <div
        className="absolute size-full bg-primary/80 transition-all duration-500"
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
};

interface EmptyUploadProps {
  isDragging: boolean;
  type: "file" | "image" | "fileList";
  desc: string;
  dndDesc: string;
}

export const EmptyUpload = ({ type, isDragging, desc, dndDesc }: EmptyUploadProps) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 text-[45px] text-muted-foreground duration-300 group-hover:text-background",
        isDragging && "text-success",
      )}
    >
      <div className="flex h-full items-center justify-center gap-4">
        {type === "image" ? <AiFillFileImage /> : type === "file" ? <AiFillFileText /> : <GiFiles />}
      </div>
      <div
        className={cn(
          "w-fit text-muted-foreground text-sm duration-300 group-hover:text-background",
          isDragging && "text-success",
        )}
      >
        {desc}
      </div>
      <div
        className={cn(
          "flex flex-row items-center justify-center gap-2 rounded-md border border-dashed px-1 py-1 text-[8px] text-muted-foreground duration-300 group-hover:text-background",
          isDragging && "border-success text-success",
        )}
      >
        {dndDesc}
        <TbDragDrop className="text-sm" />
      </div>
    </div>
  );
};
