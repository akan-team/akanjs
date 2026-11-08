"use client";
import { msg } from "@libs/util/client";
import { cn } from "akanjs/client";
import { BiCopyAlt, BiFile, BiImageAdd } from "react-icons/bi";

export const warnUploadRejected = () => {
  msg.warning("util.uploadTypeNotAllowed");
};

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
        "flex flex-col items-center justify-center gap-1 px-3 text-center text-muted-foreground",
        isDragging && "text-primary",
      )}
    >
      <span className="pb-1 text-3xl">
        {type === "image" ? <BiImageAdd /> : type === "file" ? <BiFile /> : <BiCopyAlt />}
      </span>
      <span className={cn("font-medium text-foreground text-sm", isDragging && "text-primary")}>{desc}</span>
      <span className="text-xs">{dndDesc}</span>
    </div>
  );
};
