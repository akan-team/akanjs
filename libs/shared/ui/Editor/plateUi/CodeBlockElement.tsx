"use client";

import "./codeBlockElement.css";

import { cn, withRef } from "@udecode/cn";
import { useCodeBlockElementState } from "@udecode/plate-code-block";
import { PlateElement } from "@udecode/plate-common";
import React from "react";

import { CodeBlockCombobox } from "./CodeBlockCombobox";

export const CodeBlockElement = withRef<typeof PlateElement>(({ className, children, ...props }, ref) => {
  const { element } = props;
  const state = useCodeBlockElementState({ element });

  return (
    <PlateElement
      ref={ref}
      className={cn("relative py-1 bg-base-300/80 rounded-md", state.className, className)}
      {...props}
    >
      <pre className="bg-muted overflow-x-auto rounded-md px-6 py-8 font-mono text-sm leading-[normal] [tab-size:2]">
        <code>{children}</code>
      </pre>

      {state.syntax && (
        <div className="absolute right-2 top-2 z-10 select-none" contentEditable={false}>
          <CodeBlockCombobox />
        </div>
      )}
    </PlateElement>
  );
});
