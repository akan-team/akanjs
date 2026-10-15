"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { resolveServerUrl } from "akanjs/client";
import type { NodeKey } from "lexical";
import type { SyntheticEvent } from "react";
import { $isImageNode } from "./imageNode.util";
import { MediaFrame } from "./shared";
import type { ImageFit, MediaAlign } from "./shared.type";
import { adoptByKey, mediaResetWidth, updateNodeByKey } from "./shared.util";

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
  const editable = useLexicalEditable();

  const setSize = (nextWidth: number, nextHeight: number, merge = false) =>
    updateNodeByKey(editor, nodeKey, (node) => $isImageNode(node) && node.setSize(nextWidth, nextHeight), merge);

  // Images uploaded without dimensions still resize: the handles start from the size the file loads at.
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (!editable || width || height) return;
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    const cappedWidth = Math.min(naturalWidth, mediaResetWidth);
    const cappedHeight = Math.round((cappedWidth / naturalWidth) * naturalHeight);
    adoptByKey(editor, nodeKey, (node) => $isImageNode(node) && node.setSize(cappedWidth, cappedHeight));
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
      onReset={() => setSize(mediaResetWidth, height && width ? Math.round((mediaResetWidth / width) * height) : 0)}
    >
      <img
        src={resolveServerUrl(src)}
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
