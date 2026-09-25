"use client";
import { buttonRecipe } from "@libs/util/ui";
import { cn } from "akanjs/client";
import type { NodeKey } from "lexical";
import { AiOutlineDelete, AiOutlineDownload, AiOutlineFile } from "react-icons/ai";
import { formatSize } from "./fileNode.util";
import { useMediaNode } from "./shared.util";

interface FileComponentProps {
  nodeKey: NodeKey;
  src: string;
  name: string;
  size?: number;
  format?: string;
}

export const FileComponent = ({ nodeKey, src, name, size, format }: FileComponentProps) => {
  const { editable, isSelected, removeNode } = useMediaNode(nodeKey);
  const sizeLabel = formatSize(size);

  return (
    <div className="my-2 flex w-full" contentEditable={false}>
      <div
        className={cn(
          "group/media relative flex w-full max-w-md items-center gap-3 rounded-lg border border-foreground/15 bg-muted/60 p-3",
          isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-background text-foreground/70 text-xl">
          <AiOutlineFile />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-sm">{name}</span>
          <span className="text-foreground/50 text-xs uppercase">
            {[format, sizeLabel].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            download={name}
            className={buttonRecipe({ size: "xs", variant: "ghost" }, "min-h-7")}
            title="Download"
            onMouseDown={(event) => event.preventDefault()}
          >
            <AiOutlineDownload />
          </a>
          {editable ? (
            <button
              type="button"
              title="Delete"
              className={buttonRecipe({ size: "xs", variant: "ghost" }, "min-h-7")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={removeNode}
            >
              <AiOutlineDelete className="text-destructive" />
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
};
