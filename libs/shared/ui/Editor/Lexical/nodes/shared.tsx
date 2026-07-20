"use client";
import { clsx } from "akanjs/client";
import type { NodeKey } from "lexical";
import { type ReactNode, type PointerEvent as ReactPointerEvent, useRef } from "react";
import {
  AiOutlineAlignCenter,
  AiOutlineAlignLeft,
  AiOutlineAlignRight,
  AiOutlineDelete,
  AiOutlineExpand,
} from "react-icons/ai";
import type { ImageFit, MediaAlign } from "./shared.type";
import { ALIGN_TO_JUSTIFY, useMediaNode } from "./shared.util";

interface MediaFrameProps {
  nodeKey: NodeKey;
  align: MediaAlign;
  /** Current rendered width in px, used as the resize origin. `0` disables resizing. */
  width?: number;
  height?: number;
  minWidth?: number;
  /** Fit control (images only): current value + setter. Omit to hide the Fit/Fill buttons. */
  fit?: ImageFit;
  onSetFit?: (fit: ImageFit) => void;
  onSetAlign: (align: MediaAlign) => void;
  onResize?: (width: number, height: number) => void;
  onReset?: () => void;
  /** Extra menu buttons (e.g. Excalidraw's Edit/Reset), rendered after the align group. */
  extraActions?: ReactNode;
  children: ReactNode;
}

/**
 * Shared chrome for resizable, alignable decorator media (image/video/embed):
 * an alignment wrapper, a selection ring, a floating action menu (align / fit /
 * reset / delete), and left/right pointer resize handles. Selection, deletion,
 * and node updates come from {@link useMediaNode}; the caller supplies the inner
 * media element (`children`) and the concrete node setters.
 */
export const MediaFrame = ({
  nodeKey,
  align,
  width = 0,
  height = 0,
  minWidth = 120,
  fit,
  onSetFit,
  onSetAlign,
  onResize,
  onReset,
  extraActions,
  children,
}: MediaFrameProps) => {
  const { editable, isSelected, removeNode } = useMediaNode(nodeKey);
  const resizingRef = useRef<{ x: number; width: number } | null>(null);
  const aspectRatio = width && height ? width / height : 16 / 9;
  const resizable = editable && !!onResize && width > 0;

  const createResizeHandlers = (side: "left" | "right") => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      resizingRef.current = { x: event.clientX, width };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const resizing = resizingRef.current;
      if (!resizing || !onResize) return;
      const delta = event.clientX - resizing.x;
      const nextWidth = Math.max(minWidth, Math.round(resizing.width + (side === "right" ? delta : -delta)));
      onResize(nextWidth, Math.round(nextWidth / aspectRatio));
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      resizingRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
  });

  const handleClassName = clsx(
    "absolute top-1/2 z-40 h-12 w-1.5 -translate-y-1/2 cursor-ew-resize rounded-full border border-base-content/30 bg-base-100/90 shadow-lg",
    "opacity-0 transition-opacity hover:opacity-100 group-hover/media:opacity-70",
  );

  return (
    <div className={clsx("my-2 flex w-full", ALIGN_TO_JUSTIFY[align])} contentEditable={false}>
      <div
        className={clsx(
          "group/media relative inline-block max-w-full rounded-md",
          isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-base-100",
        )}
      >
        {children}
        {editable && isSelected ? (
          <div
            className="absolute top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-base-content/15 bg-base-100 p-1 text-base-content shadow-xl"
            onMouseDown={(event) => event.preventDefault()}
          >
            <MediaMenuButton active={align === "left"} title="Align left" onClick={() => onSetAlign("left")}>
              <AiOutlineAlignLeft />
            </MediaMenuButton>
            <MediaMenuButton active={align === "center"} title="Align center" onClick={() => onSetAlign("center")}>
              <AiOutlineAlignCenter />
            </MediaMenuButton>
            <MediaMenuButton active={align === "right"} title="Align right" onClick={() => onSetAlign("right")}>
              <AiOutlineAlignRight />
            </MediaMenuButton>
            {extraActions ? (
              <>
                <span className="mx-0.5 h-5 w-px bg-base-content/15" />
                {extraActions}
              </>
            ) : null}
            {fit && onSetFit ? (
              <>
                <span className="mx-0.5 h-5 w-px bg-base-content/15" />
                <MediaMenuButton active={fit === "contain"} title="Fit" onClick={() => onSetFit("contain")}>
                  Fit
                </MediaMenuButton>
                <MediaMenuButton active={fit === "cover"} title="Fill" onClick={() => onSetFit("cover")}>
                  Fill
                </MediaMenuButton>
              </>
            ) : null}
            {onReset ? (
              <>
                <span className="mx-0.5 h-5 w-px bg-base-content/15" />
                <MediaMenuButton title="Reset size" onClick={onReset}>
                  <AiOutlineExpand />
                </MediaMenuButton>
              </>
            ) : null}
            <span className="mx-0.5 h-5 w-px bg-base-content/15" />
            <MediaMenuButton title="Delete" onClick={removeNode}>
              <AiOutlineDelete className="text-error" />
            </MediaMenuButton>
          </div>
        ) : null}
        {resizable ? (
          <>
            <button
              type="button"
              aria-label="Resize from left"
              className={clsx(handleClassName, "left-1")}
              {...createResizeHandlers("left")}
            />
            <button
              type="button"
              aria-label="Resize from right"
              className={clsx(handleClassName, "right-1")}
              {...createResizeHandlers("right")}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};

interface MediaMenuButtonProps {
  children: ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}

export const MediaMenuButton = ({ children, title, active, onClick }: MediaMenuButtonProps) => (
  <button
    type="button"
    title={title}
    className={clsx("btn btn-xs btn-ghost min-h-7 gap-1 px-2", { "btn-active": active })}
    onClick={onClick}
  >
    {children}
  </button>
);
