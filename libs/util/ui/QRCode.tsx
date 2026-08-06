"use client";
import { cn } from "akanjs/client";
import { QRCodeSVG } from "qrcode.react";

export interface QRCodeProps {
  href: string;
  className?: string;
}
export const QRCode = ({ href, className }: QRCodeProps) => {
  return (
    <QRCodeSVG
      className={cn("size-12 cursor-pointer", className)}
      value={href}
      onClick={() => {
        window.open(href, "_blank");
      }}
    />
  );
};
