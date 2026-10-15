"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { usePage } from "@libs/shared/client";
import { RichUrl } from "@libs/shared/common";
import { buttonRecipe, inputRecipe } from "@libs/util/ui";
import type { NodeKey } from "lexical";
import { useState } from "react";
import { useEditorUpload } from "../UploadContext";
import { $isEmbedNode, defaultEmbedHeight, defaultEmbedWidth } from "./embedNode.util";
import { MediaFrame } from "./shared";
import type { MediaAlign } from "./shared.type";
import { updateNodeByKey } from "./shared.util";

interface EmbedComponentProps {
  nodeKey: NodeKey;
  embedUrl: string;
  width: number;
  height: number;
  align: MediaAlign;
}

export const EmbedComponent = ({ nodeKey, embedUrl, width, height, align }: EmbedComponentProps) => {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const { policy } = useEditorUpload();
  const { l } = usePage();
  // The stored url is checked again here: a document also arrives from an agent, a script or a peer.
  const player = RichUrl.embed(embedUrl, policy.allowedEmbedProviders);

  if (!player)
    return editable ? (
      <EmbedUrlForm nodeKey={nodeKey} />
    ) : (
      <div className="my-2 flex w-full justify-center" contentEditable={false}>
        <div className="rounded-md bg-muted p-6 text-foreground/50">{l("shared.editor-embedUnavailable")}</div>
      </div>
    );

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
      onReset={() => setSize(defaultEmbedWidth, defaultEmbedHeight)}
    >
      <iframe
        title={player.type}
        src={player.embedUrl}
        width={width}
        height={height}
        allowFullScreen
        // The players need scripts and their own origin; navigating this page and forms are what is withheld.
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        // YouTube refuses to play for an embedder that sends no referrer at all.
        referrerPolicy="strict-origin-when-cross-origin"
        className="block max-w-full rounded-md bg-muted"
      />
    </MediaFrame>
  );
};

export const EmbedUrlForm = ({ nodeKey }: { nodeKey: NodeKey }) => {
  const [editor] = useLexicalComposerContext();
  const { policy } = useEditorUpload();
  const { l } = usePage();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const providers = policy.allowedEmbedProviders.join(", ");

  const submit = () => {
    const resolved = RichUrl.embed(value.trim(), policy.allowedEmbedProviders);
    if (!resolved) {
      setError(l("shared.editor-embedUnsupported", { providers }));
      return;
    }
    setError(null);
    updateNodeByKey(editor, nodeKey, (node) => {
      if ($isEmbedNode(node)) node.setSource(value.trim(), resolved.embedUrl, resolved.type);
    });
  };

  return (
    <div className="my-2 flex w-full justify-center" contentEditable={false}>
      <div className="flex w-full max-w-md flex-col gap-2 rounded-lg border border-foreground/15 bg-muted/60 p-3">
        <span className="font-medium text-foreground/70 text-sm">{l("shared.editor-embedPaste", { providers })}</span>
        <div className="flex gap-2">
          <input
            type="url"
            autoFocus
            value={value}
            placeholder="https://www.youtube.com/watch?v=…"
            className={inputRecipe({ size: "sm" }, "w-full")}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          <button type="button" className={buttonRecipe({ size: "sm", variant: "primary" })} onClick={submit}>
            {l("shared.editor-embed")}
          </button>
        </div>
        {error ? <span className="text-destructive text-xs">{error}</span> : null}
      </div>
    </div>
  );
};
