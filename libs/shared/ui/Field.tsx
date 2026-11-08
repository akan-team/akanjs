"use client";
import { cn } from "akanjs/client";
import { actionTagOf } from "akanjs/store";
import { Field as AkanField } from "akanjs/ui";
import { type ComponentProps, memo } from "react";

import { Editor } from "./Editor";
import type { RichProps } from "./field.type";
import { sliceUploadOf } from "./field.util";
import { Coordinate, Postcode } from "./LocationField";
import { File, Files, Img, Imgs } from "./UploadField";

const Rich = memo(
  ({
    label,
    desc,
    labelClassName,
    className,
    slice,
    value,
    onChange,
    addFile,
    addFilesGql,
    attachments,
    onAttachmentsChange,
    onUploadError,
    uploadPolicy,
    toolbar,
    blockActions,
    slashMenu,
    markdown,
    features,
    placeholder,
    lineHint,
    nullable,
    disabled,
    editorHeight,
    plugins,
    agentName,
    agentBlocks,
    collab,
  }: RichProps) => {
    // No useFieldTool here: it cannot describe an Any field, so AgentRichPlugin publishes this setter as markdown.
    const agentAction = agentName ?? actionTagOf(onChange)?.action ?? null;
    return (
      <div className={cn("flex flex-col", className)}>
        {label ? <AkanField.Label className={labelClassName} nullable={nullable} label={label} desc={desc} /> : null}
        <Editor.Rich
          value={value}
          placeholder={placeholder}
          lineHint={lineHint}
          addFilesGql={addFilesGql ?? sliceUploadOf(slice)}
          addFile={addFile}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
          onUploadError={onUploadError}
          uploadPolicy={uploadPolicy}
          toolbar={toolbar}
          blockActions={blockActions}
          slashMenu={slashMenu}
          markdown={markdown}
          features={features}
          onChange={onChange}
          disabled={disabled}
          className="w-full"
          height={editorHeight}
          plugins={plugins}
          agentName={agentAction}
          agentBlocks={agentBlocks}
          collab={collab}
        />
      </div>
    );
  },
);

const Section = (props: ComponentProps<typeof AkanField>) => <AkanField {...props} />;

export const Field = Object.assign(Section, AkanField, { Rich, Coordinate, Postcode, Img, Imgs, File, Files });
