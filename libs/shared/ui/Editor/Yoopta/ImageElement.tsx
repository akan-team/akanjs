"use client";

import { type PluginElementRenderProps, useBlockData, useYooptaEditor, useYooptaReadOnly } from "@yoopta/editor";
import { ImageCommands, type ImageElementProps } from "@yoopta/image";
import { clsx } from "akanjs/client";
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import {
  AiOutlineAlignCenter,
  AiOutlineAlignLeft,
  AiOutlineAlignRight,
  AiOutlineDelete,
  AiOutlineExpand,
} from "react-icons/ai";

type Align = "left" | "center" | "right";
type Fit = "contain" | "cover" | "fill";

const ALIGN_TO_JUSTIFY: Record<Align, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

export const ImageElement = ({ attributes, children, element, blockId }: PluginElementRenderProps) => {
  const editor = useYooptaEditor();
  const readOnly = useYooptaReadOnly();
  const block = useBlockData(blockId);
  const props = element.props as ImageElementProps;
  const [menuOpen, setMenuOpen] = useState(false);
  const resizingRef = useRef<{ x: number; width: number; height: number } | null>(null);

  const align = (block?.meta.align ?? "center") as Align;
  const width = toSize(props.sizes?.width);
  const height = toSize(props.sizes?.height);
  const aspectRatio = width && height ? width / height : 1;

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  const updateSizes = (nextWidth: number) => {
    const safeWidth = Math.max(120, Math.round(nextWidth));
    const safeHeight = Math.max(80, Math.round(safeWidth / aspectRatio));
    ImageCommands.updateImage(editor, blockId, { ...props, sizes: { width: safeWidth, height: safeHeight } });
  };

  const setAlign = (nextAlign: Align) => {
    editor.updateBlock(blockId, { meta: { ...block.meta, align: nextAlign } });
  };

  const setFit = (nextFit: Fit) => {
    ImageCommands.updateImage(editor, blockId, { ...props, fit: nextFit });
  };

  const resetSize = () => {
    ImageCommands.updateImage(editor, blockId, {
      ...props,
      sizes: { width: 650, height: Math.round(650 / aspectRatio) },
    });
  };

  const removeImage = () => {
    ImageCommands.deleteImage(editor, blockId);
  };

  const handleClassName = clsx(
    "absolute top-1/2 z-40 h-12 w-1.5 -translate-y-1/2 cursor-ew-resize rounded-full border border-base-content/30 bg-base-100/90 shadow-lg",
    "opacity-60 transition-opacity hover:opacity-100 group-hover/yoopta-image:opacity-100",
  );

  const createResizeHandlers = (side: "left" | "right") => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      resizingRef.current = { x: event.clientX, width: width || 320, height: height || 180 };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const resizing = resizingRef.current;
      if (!resizing) return;
      const delta = event.clientX - resizing.x;
      updateSizes(resizing.width + (side === "right" ? delta : -delta));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      resizingRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
  });

  return (
    <div {...attributes} contentEditable={false} className={clsx("my-2 flex w-full", ALIGN_TO_JUSTIFY[align])}>
      <div
        className="group/yoopta-image relative inline-block max-w-full"
        onClick={(event) => {
          if (readOnly) return;
          event.stopPropagation();
          setMenuOpen(true);
        }}
      >
        <img
          src={props.src ?? undefined}
          alt={props.alt ?? ""}
          width={width || undefined}
          height={height || undefined}
          className="block max-w-full rounded-md object-contain"
          style={{ objectFit: props.fit ?? "contain", backgroundColor: props.bgColor ?? undefined }}
          draggable={false}
        />
        {!readOnly ? (
          <>
            {menuOpen ? (
              <div
                className="absolute top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-base-content/15 bg-base-100 p-1 text-base-content shadow-xl"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.preventDefault()}
              >
                <MenuButton active={align === "left"} title="Align left" onClick={() => setAlign("left")}>
                  <AiOutlineAlignLeft />
                </MenuButton>
                <MenuButton active={align === "center"} title="Align center" onClick={() => setAlign("center")}>
                  <AiOutlineAlignCenter />
                </MenuButton>
                <MenuButton active={align === "right"} title="Align right" onClick={() => setAlign("right")}>
                  <AiOutlineAlignRight />
                </MenuButton>
                <span className="mx-0.5 h-5 w-px bg-base-content/15" />
                <MenuButton
                  active={(props.fit ?? "contain") === "contain"}
                  title="Fit"
                  onClick={() => setFit("contain")}
                >
                  Fit
                </MenuButton>
                <MenuButton active={props.fit === "cover"} title="Fill" onClick={() => setFit("cover")}>
                  Fill
                </MenuButton>
                <span className="mx-0.5 h-5 w-px bg-base-content/15" />
                <MenuButton title="Reset size" onClick={resetSize}>
                  <AiOutlineExpand />
                </MenuButton>
                <MenuButton title="Delete" onClick={removeImage}>
                  <AiOutlineDelete className="text-error" />
                </MenuButton>
              </div>
            ) : null}
            <button
              type="button"
              aria-label="Resize image from left"
              className={clsx(handleClassName, "left-1")}
              {...createResizeHandlers("left")}
            />
            <button
              type="button"
              aria-label="Resize image from right"
              className={clsx(handleClassName, "right-1")}
              {...createResizeHandlers("right")}
            />
          </>
        ) : null}
        {children}
      </div>
    </div>
  );
};

interface MenuButtonProps {
  children: ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}
const MenuButton = ({ children, title, active, onClick }: MenuButtonProps) => (
  <button
    type="button"
    title={title}
    className={clsx("btn btn-xs btn-ghost min-h-7 gap-1 px-2", { "btn-active": active })}
    onClick={onClick}
  >
    {children}
  </button>
);

const toSize = (value: string | number | undefined) => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};
