"use client";
import { usePage } from "@libs/util/client";
import { cn, Device } from "akanjs/client";
import type { ProtoLightFile } from "akanjs/constant";
import { BottomSheet, type BottomSheetRef, Image } from "akanjs/ui";
import { useCamera } from "akanjs/webkit";
import { Fragment, type ReactNode, useRef, useState } from "react";
import { BiImageAdd, BiLoaderAlt, BiTrash } from "react-icons/bi";

import { formatBytes } from "../common/formatBytes";
import { useFileDrop } from "../webkit/useFileDrop";
import { CropImage, type CropRef } from "./CropImage";
import { buttonRecipe } from "./Recipe";
import { EmptyUpload, Progress, warnUploadRejected } from "./UploadParts";

const imageAccept = "image/jpeg, image/png, image/gif, image/webp, image/avif";

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

interface UploadImageProps {
  className?: string;
  wrapperClassName?: string;
  type: "image" | "crop";
  protoFile: ProtoLightFile | null;
  styleType: "circle" | "square";
  /** `inline` sets a small tile beside its buttons and hint, for a logo or an avatar inside a form. */
  layout?: "stack" | "inline";
  /** Off for a gallery item: picking again there adds an image instead of replacing this one. */
  canReplace?: boolean;
  renderEmpty?: () => ReactNode;
  renderComplete?: (file: ProtoLightFile) => ReactNode;
  onSave: (file: File | FileList) => void | Promise<void>;
  onRemove: (file: File | FileList) => void;
  aspectRatio?: number[];
  disabled?: boolean;
  multiple?: boolean;
  maxCount?: number;
}

export const UploadImage = ({
  className,
  wrapperClassName,
  type,
  protoFile,
  styleType,
  layout = "stack",
  canReplace = true,
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
  const roundedClassName = styleType === "circle" ? "rounded-full" : "rounded-box";
  const isInline = layout === "inline";
  const hasImage = protoFile?.status === "active";
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
    onReject: warnUploadRejected,
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

  const removeImage = () => {
    if (protoFile) onRemove(protoFile as unknown as File);
  };
  const changeButton =
    disabled || !canReplace ? null : (
      <button
        type="button"
        disabled={isLocked}
        className={buttonRecipe({ variant: "ghost", size: "sm" }, "text-muted-foreground hover:text-foreground")}
        onClick={() => void onSelectImage()}
      >
        {l("util.uploadImageChange")}
      </button>
    );
  const removeButton = disabled ? null : (
    <button
      type="button"
      disabled={isLocked}
      aria-label={l("base.remove")}
      title={l("base.remove")}
      className={buttonRecipe(
        { variant: "ghost", size: "sm", shape: "square" },
        "text-muted-foreground hover:text-destructive",
      )}
      onClick={removeImage}
    >
      <BiTrash />
    </button>
  );
  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={imageAccept}
      multiple={isMultiple}
      className="hidden"
      onChange={onInputChange}
    />
  );

  const inlineRow = hasImage ? (
    <div
      {...dropProps}
      className={cn(
        "flex w-full items-center gap-3 rounded-box border border-border bg-card p-2 pr-2.5 transition-colors",
        isDragging && "border-primary border-dashed bg-primary/5",
        className,
      )}
    >
      <span className={cn("grid size-12 shrink-0 place-items-center overflow-hidden bg-muted", roundedClassName)}>
        <Image className="size-full object-cover" file={protoFile} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">{protoFile.filename}</span>
        <span className="block text-muted-foreground text-xs tabular-nums">{formatBytes(protoFile.size, 1)}</span>
      </span>
      {changeButton}
      {removeButton}
    </div>
  ) : (
    <button
      type="button"
      disabled={isLocked}
      onClick={() => void onSelectImage()}
      {...dropProps}
      className={cn(
        "flex w-full items-center gap-3 rounded-box border border-border border-dashed p-2 text-left transition-colors hover:bg-muted/60",
        isDragging && "border-primary bg-primary/5",
        className,
      )}
    >
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center bg-muted text-muted-foreground text-xl",
          roundedClassName,
          isDragging && "text-primary",
        )}
      >
        {isUploading ? <BiLoaderAlt className="animate-spin" /> : <BiImageAdd />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground text-sm">{l("util.uploadImageClick")}</span>
        {isUploading ? (
          <span className="mt-1.5 block max-w-48">
            <Progress value={protoFile.progress ?? 0} max={100} />
          </span>
        ) : (
          <span className="block break-keep text-muted-foreground text-xs">{l("util.uploadImageHint")}</span>
        )}
      </span>
    </button>
  );

  return (
    <>
      {isInline ? (
        <div className={cn("w-full", wrapperClassName)}>
          {fileInput}
          {inlineRow}
        </div>
      ) : (
        <div className={cn("flex flex-col items-start gap-2", wrapperClassName)}>
          {fileInput}
          {hasImage && renderComplete ? (
            renderComplete(protoFile)
          ) : (
            <button
              type="button"
              disabled={isLocked}
              aria-label={l(hasImage ? "util.uploadImageChange" : "util.uploadImageClick")}
              onClick={() => void onSelectImage()}
              {...dropProps}
              className={cn(
                "relative grid size-56 shrink-0 place-items-center overflow-hidden border border-border transition-colors",
                roundedClassName,
                hasImage ? "bg-background" : "border-dashed bg-muted/40 hover:bg-muted",
                isDragging && "border-primary border-dashed bg-primary/5",
                className,
              )}
            >
              {hasImage ? (
                <Image className="size-full object-cover" file={protoFile} />
              ) : renderEmpty ? (
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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 px-4 backdrop-blur-sm">
                  <BiLoaderAlt className="animate-spin text-lg" />
                  <Progress value={protoFile.progress ?? 0} max={100} />
                </div>
              ) : null}
            </button>
          )}
          {hasImage && !renderComplete && !disabled ? (
            <div className="flex items-center gap-0.5">
              {changeButton}
              {removeButton}
            </div>
          ) : null}
        </div>
      )}
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
              {isSaving ? <BiLoaderAlt className="animate-spin" /> : l("base.save")}
            </button>
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
};

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

export const UploadImages = ({
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
            canReplace={false}
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
