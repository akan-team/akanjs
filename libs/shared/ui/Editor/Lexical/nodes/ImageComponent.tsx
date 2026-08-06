"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { NodeKey } from "lexical";
import type { SyntheticEvent } from "react";
import { $isImageNode, RESET_WIDTH } from "./imageNode.util";
import { MediaFrame } from "./shared";
import type { ImageFit, MediaAlign } from "./shared.type";
import { updateNodeByKey } from "./shared.util";

interface ImageComponentProps {
  nodeKey: NodeKey;
  src: string;
  alt: string;
  width: number;
  height: number;
  align: MediaAlign;
  fit: ImageFit;
  bgColor?: string;
}

export const ImageComponent = ({ nodeKey, src, alt, width, height, align, fit, bgColor }: ImageComponentProps) => {
  const [editor] = useLexicalComposerContext();

  const setSize = (nextWidth: number, nextHeight: number, merge = false) =>
    updateNodeByKey(editor, nodeKey, (node) => $isImageNode(node) && node.setSize(nextWidth, nextHeight), merge);

  // Adopt the intrinsic size once, so images uploaded without dimensions still resize.
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (width || height) return;
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    const cappedWidth = Math.min(naturalWidth, RESET_WIDTH);
    setSize(cappedWidth, Math.round((cappedWidth / naturalWidth) * naturalHeight), true);
  };

  return (
    <MediaFrame
      nodeKey={nodeKey}
      align={align}
      width={width}
      height={height}
      minWidth={120}
      fit={fit}
      onSetFit={(nextFit) => updateNodeByKey(editor, nodeKey, (node) => $isImageNode(node) && node.setFit(nextFit))}
      onSetAlign={(nextAlign) =>
        updateNodeByKey(editor, nodeKey, (node) => $isImageNode(node) && node.setAlign(nextAlign))
      }
      onResize={(nextWidth, nextHeight) => setSize(nextWidth, nextHeight, true)}
      onReset={() => setSize(RESET_WIDTH, height && width ? Math.round((RESET_WIDTH / width) * height) : 0)}
    >
      <img
        src={src}
        alt={alt}
        width={width || undefined}
        height={height || undefined}
        onLoad={onLoad}
        draggable={false}
        className="block max-w-full rounded-md object-contain"
        style={{ objectFit: fit, backgroundColor: bgColor }}
      />
    </MediaFrame>
  );
};
