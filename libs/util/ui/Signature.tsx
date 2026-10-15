"use client";
import { msg, usePage } from "@libs/util/client";
import { cn } from "akanjs/client";
import { type ChangeEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { AiOutlineDelete, AiOutlineUpload } from "react-icons/ai";
import { BiEditAlt } from "react-icons/bi";
import { buttonRecipe, inputRecipe } from "./Recipe";

export interface SignatureProps {
  className?: string;
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
  drawLabel?: string;
  uploadLabel?: string;
  clearLabel?: string;
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (event) => reject(event);
    image.src = src;
  });

const drawFitted = (canvas: HTMLCanvasElement, image: HTMLImageElement) => {
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
};

//? Both modes emit a PNG data URL of at most width × height, small enough to keep in a plain string field.
export const Signature = ({
  className,
  value,
  onChange,
  width = 480,
  height = 200,
  drawLabel,
  uploadLabel,
  clearLabel,
}: SignatureProps) => {
  const { l } = usePage();
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    if (!value || !canvas) return;
    let isCurrent = true;
    void loadImage(value)
      .then((image) => {
        if (isCurrent && !dirty.current) drawFitted(canvas, image);
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, [mode]);

  const pointerPos = (canvas: HTMLCanvasElement, e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    const { x, y } = pointerPos(canvas, e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvas.setPointerCapture(e.pointerId);
  };

  const moveDraw = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { x, y } = pointerPos(canvas, e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };

  const endDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (dirty.current && canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    onChange(null);
  };

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      drawFitted(canvas, await loadImage(objectUrl));
      dirty.current = false;
      onChange(canvas.toDataURL("image/png"));
    } catch {
      msg.error("util.signatureImageUnreadable");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex gap-1">
        <button
          type="button"
          className={buttonRecipe({ size: "sm", variant: mode === "draw" ? "primary" : "ghost" })}
          onClick={() => {
            setMode("draw");
          }}
        >
          <BiEditAlt /> {drawLabel ?? l("util.signatureDraw")}
        </button>
        <button
          type="button"
          className={buttonRecipe({ size: "sm", variant: mode === "upload" ? "primary" : "ghost" })}
          onClick={() => {
            setMode("upload");
          }}
        >
          <AiOutlineUpload /> {uploadLabel ?? l("util.signatureUpload")}
        </button>
        <button
          type="button"
          className={buttonRecipe({ variant: "ghost", size: "sm" }, "ml-auto text-destructive")}
          onClick={clear}
        >
          <AiOutlineDelete /> {clearLabel ?? l("util.signatureClear")}
        </button>
      </div>
      {mode === "draw" ? (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="aspect-[12/5] w-full touch-none rounded-box border border-border bg-background"
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-box border border-border border-dashed p-4">
          <input
            type="file"
            accept="image/*"
            className={inputRecipe(
              {},
              "py-1 file:mr-3 file:rounded-field file:border-0 file:bg-muted file:px-3 file:py-1 file:font-medium file:text-foreground file:text-sm",
            )}
            onChange={(event) => void onUpload(event)}
          />
          {value ? <img src={value} alt={l("util.signature")} className="max-h-40 object-contain" /> : null}
        </div>
      )}
    </div>
  );
};
