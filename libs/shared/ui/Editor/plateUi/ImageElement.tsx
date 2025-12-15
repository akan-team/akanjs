"use client";
import { clsx } from "@akanjs/client";
import { useDebounce } from "@akanjs/next";
import { cn, withRef } from "@udecode/cn";
import { PlateElement, setNodes, useEditorState, useElement, withHOC } from "@udecode/plate-common";
import { Image, useMediaState } from "@udecode/plate-media";
import { ResizableProvider, useResizableState } from "@udecode/plate-resizable";
import React, { useEffect } from "react";
import { type Location } from "slate";

import { Caption, CaptionTextarea } from "./Caption";
import { mediaResizeHandleVariants, Resizable, ResizeHandle } from "./Resizable";

export const ImageElement = withHOC(
  ResizableProvider,
  withRef<typeof PlateElement>(({ className, children, nodeProps, ...props }, ref) => {
    const editor = useEditorState();
    const element = useElement();
    const { readOnly, focused, selected, align = "center" } = useMediaState();
    const resizableState = useResizableState();
    const width = resizableState.width;

    const setWidth = useDebounce((width) => {
      if (!readOnly && width !== element.width) setNodes(editor, { width }, { at: element.path as Location });
    });

    useEffect(() => {
      if (element.width) resizableState.setWidth(element.width as number);
    }, []);

    useEffect(() => {
      setWidth(width);
    }, [width, element.width, editor, element.path, readOnly]);

    return (
      <PlateElement ref={ref} className={cn("py-2.5", className)} {...props}>
        <figure
          className={clsx("group relative m-0", readOnly && "flex flex-col items-center")}
          contentEditable={false}
        >
          <Resizable align={align} options={{ align, readOnly }} className="flex justify-center">
            <ResizeHandle
              options={{ direction: "left" }}
              className={mediaResizeHandleVariants({ direction: "left" })}
            />
            <Image
              className={cn(
                "block w-full max-w-full cursor-pointer object-cover px-0",
                "rounded-xs",
                focused && selected && "ring-2 ring-ring ring-offset-2"
              )}
              style={{ width: readOnly ? ((element.width as number | undefined) ?? "100%") : undefined }}
              alt=""
              {...nodeProps}
            />
            <ResizeHandle
              options={{ direction: "right" }}
              className={mediaResizeHandleVariants({ direction: "right" })}
            />
          </Resizable>
          <Caption align={align} style={{ width }}>
            <CaptionTextarea placeholder="Write a caption..." readOnly={readOnly} />
          </Caption>
        </figure>
        {children}
      </PlateElement>
    );
  })
);
