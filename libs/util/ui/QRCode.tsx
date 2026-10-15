"use client";
import { cn } from "akanjs/client";
import { QRCodeSVG } from "qrcode.react";

export interface QRCodeProps {
  className?: string;
  value: string;
  href?: string;
}
export const QRCode = ({ className, value, href }: QRCodeProps) => {
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("block size-12", className)}>
      <QRCodeSVG className="size-full" value={value} />
    </a>
  ) : (
    <QRCodeSVG className={cn("size-12", className)} value={value} />
  );
};
