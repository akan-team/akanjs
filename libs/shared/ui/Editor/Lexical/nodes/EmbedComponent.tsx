"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import type { NodeKey } from "lexical";
import { useState } from "react";
import type { EmbedProviderType } from "../embed";
import { resolveEmbed } from "../embed";
import { useEditorUpload } from "../UploadContext";
import { $isEmbedNode, DEFAULT_HEIGHT, DEFAULT_WIDTH } from "./embedNode.util";
import { MediaFrame } from "./shared";
import type { MediaAlign } from "./shared.type";
import { updateNodeByKey, useMediaNode } from "./shared.util";

interface EmbedComponentProps {
  nodeKey: NodeKey;
  embedUrl: string;
  provider?: EmbedProviderType;
  width: number;
  height: number;
  align: MediaAlign;
}

export const EmbedComponent = ({ nodeKey, embedUrl, provider, width, height, align }: EmbedComponentProps) => {
  const [editor] = useLexicalComposerContext();
  const { editable } = useMediaNode(nodeKey);

  if (!embedUrl) {
    // No source yet: prompt for a URL (edit mode) or render an inert placeholder.
    return editable ? (
      <EmbedUrlForm nodeKey={nodeKey} />
    ) : (
      <div className="my-2 flex w-full justify-center" contentEditable={false}>
        <div className="rounded-md bg-base-200 p-6 text-base-content/50">Embed URL is not configured.</div>
      </div>
    );
  }

  const setSize = (nextWidth: number, nextHeight: number, merge = false) =>
    updateNodeByKey(editor, nodeKey, (node) => $isEmbedNode(node) && node.setSize(nextWidth, nextHeight), merge);

  return (
    <MediaFrame
      nodeKey={nodeKey}
      align={align}
      width={width}
      height={height}
      minWidth={180}
      onSetAlign={(nextAlign) =>
        updateNodeByKey(editor, nodeKey, (node) => $isEmbedNode(node) && node.setAlign(nextAlign))
      }
      onResize={(nextWidth, nextHeight) => setSize(nextWidth, nextHeight, true)}
      onReset={() => setSize(DEFAULT_WIDTH, DEFAULT_HEIGHT)}
    >
      <iframe
        title={provider ?? "embed"}
        src={embedUrl}
        width={width}
        height={height}
        allowFullScreen
        className="block max-w-full rounded-md bg-base-200"
      />
    </MediaFrame>
  );
};

/** Inline URL entry shown inside an empty embed node (edit mode only). */
export const EmbedUrlForm = ({ nodeKey }: { nodeKey: NodeKey }) => {
  const [editor] = useLexicalComposerContext();
  const { policy } = useEditorUpload();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const resolved = resolveEmbed(value.trim(), policy.allowedEmbedProviders);
    if (!resolved) {
      setError(`Unsupported URL. Allowed: ${policy.allowedEmbedProviders.join(", ")}`);
      return;
    }
    setError(null);
    updateNodeByKey(editor, nodeKey, (node) => {
      if ($isEmbedNode(node)) node.setSource(value.trim(), resolved.embedUrl, resolved.type);
    });
  };

  return (
    <div className="my-2 flex w-full justify-center" contentEditable={false}>
      <div className="flex w-full max-w-md flex-col gap-2 rounded-lg border border-base-content/15 bg-base-200/60 p-3">
        <span className="font-medium text-base-content/70 text-sm">
          Paste a {policy.allowedEmbedProviders.join(" / ")} URL
        </span>
        <div className="flex gap-2">
          <input
            type="url"
            autoFocus
            value={value}
            placeholder="https://www.youtube.com/watch?v=…"
            className="input input-sm input-bordered w-full"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
            Embed
          </button>
        </div>
        {error ? <span className="text-error text-xs">{error}</span> : null}
      </div>
    </div>
  );
};
