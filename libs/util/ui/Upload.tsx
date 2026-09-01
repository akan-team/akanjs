"use client";
import { usePage } from "@libs/util/client";
import { useCamera } from "@libs/util/webkit";
import { cn, Device } from "akanjs/client";
import type { ProtoFile } from "akanjs/constant";
import { BottomSheet, type BottomSheetRef, Image } from "akanjs/ui";
import { type ChangeEvent, useRef, useState } from "react";
import { AiFillFileImage, AiFillFileText, AiOutlineDelete, AiOutlineLoading } from "react-icons/ai";
import { GiFiles } from "react-icons/gi";
import { TbDragDrop } from "react-icons/tb";

import { CropImage, type CropRef } from "./CropImage";
import { badgeRecipe, buttonRecipe, tableRecipe } from "./Recipe";

interface UploadProps {
  onChange?: (fileList: FileList) => void;
  multiple?: boolean;
  accept?: string;
  className?: string;
  uploadClassName?: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export const Upload = ({ onChange, multiple, accept, className, uploadClassName, children, disabled }: UploadProps) => {
  const inputFileRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList) onChange?.(fileList);
  };

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div className={className} onClick={() => inputFileRef.current?.click()}>
      <input
        ref={inputFileRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleFileSelect}
      />
      {children}
    </div>
  );
};

interface FileProps {
  multiple?: boolean;
  file: ProtoFile | null;
  render?: (file: ProtoFile) => React.ReactNode;
  onChange?: (e: File | FileList) => void | Promise<void>;
  onRemove?: (e: any) => void;
  children?: React.ReactNode;
  disabled?: boolean;
  maxCount?: number;
  className?: string;
  uploadClassName?: string;
  accept?: string;
}

export const File = ({
  multiple,
  file,
  render,
  onChange,
  onRemove,
  children,
  disabled,
  maxCount,
  className,
  uploadClassName,
  accept,
}: FileProps) => {
  const { l } = usePage();
  const [isDragging, setIsDragging] = useState(false);
  const inputFileRef = useRef<HTMLInputElement | null>(null);
  const isUploading = file?.status === "uploading";

  const onFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (isUploading) return;
    const files = e.target.files;
    if (files) void onChange?.(files[0]);
  };

  return (
    <div className={cn("relative flex flex-wrap gap-2", className)}>
      <div
        className={cn(
          buttonRecipe({ variant: "default" }, "flex size-full flex-col items-center border-2 py-5"),
          uploadClassName,
          isDragging && !isUploading && "border-2 border-success border-dashed",
          isUploading && "hover:bg-muted",
          file?.id && "bg-background",
        )}
      >
        <button
          className={cn("group w-full rounded-md")}
          onClick={(e) => {
            // e.preventDefault();
            // e.stopPropagation();
            inputFileRef.current?.click();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (isUploading) return;
            const files = e.dataTransfer.files;
            if (files.length > 0) void onChange?.(files[0]);
          }}
        >
          <input
            ref={inputFileRef}
            type="file"
            className="hidden"
            accept={accept}
            multiple={multiple}
            onChange={onFileSelect}
          />
          {file?.id ? (
            <div key={file.id} className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <AiFillFileText className="text-[75px]" />
              <div>
                <div className="text-sm">{file.filename}</div>
              </div>
            </div>
          ) : (
            <EmptyUpload
              isDragging={isDragging}
              type="file"
              desc={l("util.uploadFileClick")}
              dndDesc={l("util.uploadFileDrop")}
            />
          )}

          <div
            className={cn(
              "absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center rounded-md backdrop-blur-lg duration-100",
              !isUploading && "opacity-0",
              isUploading && "opacity-100",
            )}
          >
            <div className="flex w-[30%] flex-col items-center justify-center gap-2">
              <AiOutlineLoading className="animate-spin text-info text-lg" />
              <Progress value={file?.progress ? (file.status !== "uploading" ? 0 : file.progress) : 0} max={100} />
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

Upload.File = File;

interface FileListProps {
  multiple?: boolean;
  fileList?: ProtoFile[];
  render?: (file: ProtoFile) => React.ReactNode;
  onChange?: (e: File | File[]) => void | Promise<void>;
  onRemove?: (e: any) => void;
  children?: React.ReactNode;
  disabled?: boolean;
  maxCount?: number;
  className?: string;
  uploadClassName?: string;
  accept?: string;
}

export const FileList = ({
  multiple,
  fileList,
  render,
  onChange,
  onRemove,
  children,
  disabled,
  maxCount,
  className,
  uploadClassName,
  accept,
}: FileListProps) => {
  const { l } = usePage();
  const inputFileRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading] = useState(false);

  const onFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (isUploading) return;
    const files = e.target.files;
    if (!files) return;
    if (files.length > 1) void onChange?.(files as unknown as File[]);
    else {
      void onChange?.(files[0]);
    }
  };

  const formatSize = (size: number) => {
    const newSize = size / 1000;
    if (newSize < 1000) return `${newSize.toFixed(2)} Kb`;
    else if (newSize < 1000 * 1000) return `${(newSize / 1000).toFixed(2)} Mb`;
    else if (newSize < 1000 * 1000 * 1000) return `${(newSize / 1000 / 1000).toFixed(2)} Gb`;
    else return `${(newSize / 1000 / 1000 / 1000).toFixed(2)} Tb`;
  };

  const onDrop = (e: React.DragEvent<HTMLTableElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isUploading) return;
    const files = e.dataTransfer.files;
    if (files.length > 1) {
      void onChange?.(files as unknown as File[]);
    } else {
      const file = files[0];
      void onChange?.(file);
    }
  };

  return (
    <>
      <div className={cn("relative flex size-full flex-wrap gap-2", className)}>
        {fileList && fileList.length > 0 ? (
          <div
            className={cn(
              "relative size-full rounded-md border-2 border-border duration-200",
              isDragging && !isUploading && "border-2 border-success border-dashed",
            )}
          >
            <div className={cn("relative size-full overflow-x-auto")}>
              <table
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={onDrop}
                className={cn(tableRecipe({}, "size-full"))}
              >
                <tbody className="w-full rounded-md">
                  <tr className="w-full">
                    <td className="w-[70%] font-semibold text-sm md:w-[50%] md:text-base">filename</td>
                    <td className="text-center font-semibold text-sm md:text-base">size</td>
                    <td className="text-center font-semibold text-sm md:text-base">status</td>
                    <td className="text-center font-semibold text-sm md:text-base">-</td>
                  </tr>
                  {fileList.map((file) => {
                    const isUploading = file.status === "uploading";
                    // const isUploading = true;
                    return (
                      <tr key={file.id} className={cn("", isUploading && "opacity-50", !isUploading && "opacity-100")}>
                        <td className="w-[70%] truncate text-xs md:w-[50%] md:text-sm">{file.filename}</td>
                        <td className="text-center text-xs md:text-sm">{formatSize(file.size)}</td>
                        <td className="text-center align-middle text-xs md:text-sm">
                          <div className={badgeRecipe({ variant: "info" })}>
                            {file.status}
                            <div
                              className={cn("size-5 animate-spin", !isUploading && "hidden", isUploading && "block")}
                            />
                          </div>
                        </td>
                        <td className="text-center align-middle text-sm">
                          <div
                            className={buttonRecipe({
                              size: "xs",
                              variant: "destructive",
                              shape: "square",
                              outline: true,
                            })}
                            onClick={() => onRemove?.(file)}
                          >
                            <AiOutlineDelete />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mx-2 border-border border-t-2 p-4">
              <button
                onClick={() => {
                  inputFileRef.current?.click();
                }}
                className={buttonRecipe({ variant: "outline" }, "w-full px-2")}
              >
                {l("util.uploadFilesClick")}
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              buttonRecipe({ variant: "default" }, "group flex size-full flex-col items-center border-2 py-5"),
              uploadClassName,
              isDragging && !isUploading && "border-2 border-success border-dashed",
              isUploading && "hover:bg-muted",
            )}
            onClick={() => {
              inputFileRef.current?.click();
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            }}
            onDrop={onDrop}
          >
            <EmptyUpload
              isDragging={isDragging}
              type="fileList"
              desc={l("util.uploadFilesClick")}
              dndDesc={l("util.uploadFilesDrop")}
            />
          </div>
        )}
      </div>
      <input
        ref={inputFileRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={onFileSelect}
      />
    </>
  );
};

Upload.FileList = FileList;

interface UploadImageProps {
  type: "image" | "crop";
  protoFile: ProtoFile | null;
  styleType: "circle" | "square";
  renderEmpty?: (onSelectImage: () => void) => React.ReactNode;
  renderComplete?: (file: ProtoFile) => React.ReactNode;
  onSave: (file: File | FileList) => void | Promise<void>;
  onRemove: (file: File | FileList) => void;
  className?: string;
  wrapperClassName?: string;
  children?: React.ReactNode;
  aspectRatio?: number[];
}

const UploadImage = ({
  children,
  className,
  wrapperClassName,
  type,
  styleType,
  protoFile,
  onSave,
  onRemove,
  renderEmpty,
  renderComplete,
  aspectRatio,
}: UploadImageProps) => {
  const { getPhoto } = useCamera();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bottomSheetRef = useRef<BottomSheetRef | null>(null);
  const cropImageRef = useRef<CropRef | null>(null);
  const [image, setImage] = useState<string>();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const accept = "image/jpeg, image/png, image/gif, image/webp, image/avif";
  const { l } = usePage();
  const onCancel = () => {
    bottomSheetRef.current?.close();
    setImage(undefined);
  };
  const onSelectImage = async () => {
    const device = await Device.getDevice();
    if (Object.keys(device.info).length === 0 || device.info.platform === "web") inputRef.current?.click();
    else {
      const photo = await getPhoto();
      setImage(photo?.dataUrl);
    }
  };

  const saveHandler = async () => {
    setIsUploading(true);
    const file = await cropImageRef.current?.getFileStream();
    if (file) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      bottomSheetRef.current?.close();
      await onSave(file);
    }
    setIsUploading(false);
  };

  return (
    <>
      <div>
        <input
          ref={inputRef}
          multiple={false}
          accept={accept}
          onChange={(e) => {
            if (!e.target.files) return;
            if (type === "image") void onSave(e.target.files[0]);
            else {
              const reader = new FileReader();
              reader.readAsDataURL(e.target.files[0]);
              reader.onload = () => {
                setImage(reader.result as string);
                e.target.value = "";
              };
            }
          }}
          className="hidden"
          type="file"
        />
        {protoFile && protoFile.status === "active" ? (
          renderComplete ? (
            renderComplete(protoFile)
          ) : (
            <div
              onClick={() => {
                onRemove(protoFile as unknown as File);
              }}
              className="group relative flex size-56"
            >
              <Image
                className={cn(
                  "bg-background object-cover px-0",
                  styleType === "circle" && "rounded-full",
                  styleType === "square" && "rounded-md",
                )}
                file={protoFile}
              />

              <button
                className={cn(
                  "absolute flex size-full flex-wrap items-center justify-center opacity-0 backdrop-blur-lg group-hover:animate-fadeIn",
                  styleType === "circle" && "rounded-full",
                  styleType === "square" && "rounded-md",
                )}
              >
                <AiOutlineDelete className="text-3xl text-primary/0 transition duration-300 group-hover:text-destructive" />
              </button>
            </div>
          )
        ) : (
          <div className="relative flex w-full">
            <button
              className={cn(
                "group aspect-1 size-56 bg-background px-0 duration-300",
                styleType === "circle" && "rounded-full",
                styleType === "square" && "rounded-md",
                !isAccepted && "cursor-not-allowed",
              )}
            >
              <div
                onClick={() => {
                  void onSelectImage();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  if (isUploading) return;
                  const files = e.dataTransfer.files;
                  if (files.length > 0) {
                    const file = files[0];
                    if (accept.includes(file.type)) {
                      void onSave(file);
                    } else setIsAccepted(false);
                  }
                }}
                className={cn(
                  buttonRecipe(
                    { variant: "default" },
                    "group relative flex size-full items-center justify-center md:text-lg",
                  ),
                  styleType === "circle" && "rounded-full",
                  styleType === "square" && "rounded-md",
                  isDragging && "border-2 border-success border-dashed",
                )}
              >
                {renderEmpty ? (
                  renderEmpty(onSelectImage)
                ) : (
                  <EmptyUpload
                    isDragging={isDragging}
                    type="image"
                    desc={l("util.uploadImageClick")}
                    dndDesc={l("util.uploadImageDrop")}
                  />
                )}

                {protoFile && protoFile.status === "uploading" ? (
                  <div
                    className={cn(
                      "absolute top-0 left-0 z-[100] flex size-full flex-col items-center justify-center gap-2 bg-background/30 px-10 backdrop-blur-sm",
                      styleType === "circle" && "rounded-full",
                      styleType === "square" && "rounded-md",
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
        <BottomSheet
          type="full"
          ref={bottomSheetRef}
          onCancel={() => {
            setImage(undefined);
          }}
          open={!!image}
        >
          <CropImage aspectRatio={aspectRatio} ref={cropImageRef} src={image ?? ""} />
          <div className="flex w-full items-center justify-center gap-2">
            <button className={buttonRecipe({ variant: "default" }, "w-full")} onClick={onCancel}>
              취소
            </button>
            <button
              className={buttonRecipe({ variant: "primary" }, "w-full")}
              onClick={() => {
                void saveHandler();
              }}
            >
              저장
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
  fileList?: ProtoFile[];

  disabled?: boolean;
  styleType: "circle" | "square";
  render?: (file: ProtoFile) => React.ReactNode;
  onSave: (file: File | FileList) => void | Promise<void>;
  onRemove: (file: File | FileList) => void;
}

const UploadImages = ({ multiple, fileList, disabled, styleType, render, onSave, onRemove }: UploadImagesProps) => {
  if (disabled) return null;
  return (
    <div className="flex flex-wrap">
      {!fileList ? (
        <UploadImage onSave={onSave} onRemove={onRemove} type="image" styleType={styleType} protoFile={null} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {fileList.map((file) => {
            return (
              <Upload.Image
                key={file.id}
                onSave={onSave}
                onRemove={onRemove}
                type="image"
                styleType={styleType}
                protoFile={file}
              />
            );
          })}
          <UploadImage onSave={onSave} onRemove={onRemove} type="image" styleType={styleType} protoFile={null} />
        </div>
      )}
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
