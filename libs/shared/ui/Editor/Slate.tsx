"use client";
import type { ProtoFile } from "@akanjs/constant";
import { cnst } from "@shared/client";
import { Plate, TElement } from "@udecode/plate-common";
import { ELEMENT_PARAGRAPH } from "@udecode/plate-paragraph";
import React, { memo } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, Toolbar } from "./plateUi";
import { createSlatePlugins } from "./plateUi/createSlatePlugins";

interface SlateProps {
  className?: string;
  addFilesGql: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile: (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => void;
  onChange: (value: unknown) => void;
  defaultValue?: unknown;
  height?: string;
  placeholder?: string;
  disabled?: boolean;
}

const Slate = memo(
  ({
    className = "",
    addFilesGql,
    addFile,
    onChange,
    defaultValue,
    height = "500px",
    placeholder = "",
  }: SlateProps) => {
    const initialValue = defaultValue
      ? typeof defaultValue === "string"
        ? [
            {
              id: "1",
              type: ELEMENT_PARAGRAPH,
              children: [{ text: defaultValue }],
            },
          ]
        : (defaultValue as TElement[])
      : [
          {
            id: "1",
            type: ELEMENT_PARAGRAPH,
            children: [{ text: "" }],
          },
        ];

    // const editor = createPlateEditor({ plugins: slatePlugins });
    return (
      <div className={className}>
        <DndProvider backend={HTML5Backend}>
          <Plate
            initialValue={initialValue.length > 0 ? initialValue : undefined}
            plugins={createSlatePlugins({ addFilesGql, addFile })}
            onChange={(slateContent) => {
              onChange(slateContent);
            }}
          >
            <div className="relative rounded-xl border border-black/20">
              <Toolbar addFile={addFile} addFilesGql={addFilesGql} />
              <Editor
                autoFocus
                focusRing={false}
                size="md"
                variant="ghost"
                style={{
                  height,
                }}
                placeholder={placeholder}
              />
            </div>
          </Plate>
        </DndProvider>
      </div>
    );
  }
);

export default Slate;
