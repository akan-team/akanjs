"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { NodeKey } from "lexical";
import { MediaFrame } from "./shared";
import type { MediaAlign } from "./shared.type";
import { updateNodeByKey } from "./shared.util";
import { $isVideoNode, RESET_WIDTH } from "./videoNode.util";

interface VideoComponentProps {
  nodeKey: NodeKey;
  src: string;
  poster?: string;
  width: number;
  height: number;
  align: MediaAlign;
}

export const VideoComponent = ({ nodeKey, src, poster, width, height, align }: VideoComponentProps) => {
  const [editor] = useLexicalComposerContext();

  const setSize = (nextWidth: number, nextHeight: number, merge = false) =>
    updateNodeByKey(editor, nodeKey, (node) => $isVideoNode(node) && node.setSize(nextWidth, nextHeight), merge);

  return (
    <MediaFrame
      nodeKey={nodeKey}
      align={align}
      width={width}
      height={height}
      minWidth={180}
      onSetAlign={(nextAlign) =>
        updateNodeByKey(editor, nodeKey, (node) => $isVideoNode(node) && node.setAlign(nextAlign))
      }
      onResize={(nextWidth, nextHeight) => setSize(nextWidth, nextHeight, true)}
      onReset={() => setSize(RESET_WIDTH, height && width ? Math.round((RESET_WIDTH / width) * height) : 0)}
    >
      <video
        src={src}
        poster={poster}
        controls
        width={width || undefined}
        height={height || undefined}
        className="block max-w-full rounded-md bg-black"
      />
    </MediaFrame>
  );
};
