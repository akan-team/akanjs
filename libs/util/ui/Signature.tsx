"use client";
import { clsx } from "akanjs/client";
import { type ChangeEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { AiOutlineDelete, AiOutlineUpload } from "react-icons/ai";
import { BiEditAlt } from "react-icons/bi";

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

/**
 * Signature/stamp capture control.
 * - "draw" mode lets the signer sign with a mouse/touch pointer on a canvas.
 * - "upload" mode accepts a signature or stamp image file.
 * Both modes emit the result as a PNG (draw) or file (upload) data-URL string via onChange,
 * so the value can be stored directly in a plain string field and rendered with <img src=...>.
 */
export const Signature = ({
  className,
  value,
  onChange,
  width = 480,
  height = 200,
  drawLabel = "Draw",
  uploadLabel = "Upload",
  clearLabel = "Clear",
}: SignatureProps) => {
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

  const onUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex gap-1">
        <button
          type="button"
          className={clsx("btn btn-sm", mode === "draw" ? "btn-primary" : "btn-ghost")}
          onClick={() => {
            setMode("draw");
          }}
        >
          <BiEditAlt /> {drawLabel}
        </button>
        <button
          type="button"
          className={clsx("btn btn-sm", mode === "upload" ? "btn-primary" : "btn-ghost")}
          onClick={() => {
            setMode("upload");
          }}
        >
          <AiOutlineUpload /> {uploadLabel}
        </button>
        <button type="button" className="btn btn-ghost btn-sm ml-auto text-error" onClick={clear}>
          <AiOutlineDelete /> {clearLabel}
        </button>
      </div>
      {mode === "draw" ? (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="aspect-[12/5] w-full touch-none rounded-box border border-base-300 bg-base-100"
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-box border border-base-300 border-dashed p-4">
          <input type="file" accept="image/*" className="file-input file-input-bordered w-full" onChange={onUpload} />
          {value ? <img src={value} alt="signature" className="max-h-40 object-contain" /> : null}
        </div>
      )}
    </div>
  );
};
