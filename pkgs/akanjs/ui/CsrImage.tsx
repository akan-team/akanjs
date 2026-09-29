"use client";
import { cn, resolveServerUrl } from "akanjs/client";
import type { ProtoLightFile } from "akanjs/constant";
import type { ImgHTMLAttributes } from "react";

type CsrImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src"> & {
  src?: string;
  alt?: string;
  file?: ProtoLightFile | { url: string; imageSize: [number, number]; abstractData?: string | null } | null;
  abstractData?: string | null;
  priority?: boolean;
  preload?: boolean;
  quality?: number;
  unoptimized?: boolean;
  fill?: boolean;
};

const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const CsrImage = ({ src, alt, file, className, abstractData, ...props }: CsrImageProps) => {
  const stored = src || file?.url || null;
  const url = stored ? resolveServerUrl(stored) : null;
  const [width, height] = [props.width ?? file?.imageSize[0], props.height ?? file?.imageSize[1]];
  const defaultAbstractData =
    "data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mN8//HLfwYiAOOoQvoqBABbWyZJf74GZgAAAABJRU5ErkJggg==";
  const blurDataURL = abstractData ?? file?.abstractData ?? defaultAbstractData;
  const { priority, preload, quality, unoptimized, fill, ...csrProps } = props;
  return (
    <img
      src={url ?? EMPTY_IMAGE}
      data-src={blurDataURL}
      width={width}
      height={height}
      className={cn(!url && "bg-muted", className)}
      alt={alt ?? "image"}
      {...csrProps}
    />
  );
};
