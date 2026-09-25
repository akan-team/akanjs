import { getEnv } from "akanjs/base";
import { clsx } from "akanjs/client";
import type { ProtoFile } from "akanjs/constant";
import type { ImgHTMLAttributes } from "react";
import { preload as preloadResource } from "react-dom";
// import NextImage, { ImageProps } from "next/image";

import { CsrImage } from "./CsrImage";

type ImageLikeFile = ProtoFile | { url: string; imageSize: [number, number]; abstractData?: string | null } | null;

const DEFAULT_IMAGE_DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const DEFAULT_IMAGE_SIZES = [32, 48, 64, 96, 128, 256, 384];
const DEFAULT_IMAGE_WIDTHS = [...new Set([...DEFAULT_IMAGE_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES])].sort(
  (a, b) => a - b,
);
const DEFAULT_IMAGE_QUALITY = 75;

type NativeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src" | "srcSet"> & {
  /** Fill the parent box when the renderer supports fill-style images. */
  fill?: boolean;
  /** Placeholder mode passed through to image renderers. */
  placeholder?: string;
  /** Base64 or low-quality preview data used for blur placeholders. */
  blurDataURL?: string;
};

type AkanImageProps = NativeImageProps & {
  /** Direct image URL. Takes precedence over file.url. */
  src?: string;
  /** Akan file object or file-like value with url and imageSize metadata. */
  file?: ImageLikeFile;
  /** Low-quality preview data. Overrides file.abstractData when provided. */
  abstractData?: string;
  /** Accessible alt text. Defaults to "image" when omitted. */
  alt?: string;
  /** Image optimizer quality. Defaults to 75. */
  quality?: number;
  /** Mark image as high priority and eager-loading. */
  priority?: boolean;
  /** Preload image resource in SSR mode. */
  preload?: boolean;
  /** Skip Akan image optimization and use the original src. */
  unoptimized?: boolean;
};

export const Image = ({
  src,
  file,
  className,
  abstractData,
  alt,
  quality,
  priority,
  preload,
  unoptimized,
  ...props
}: AkanImageProps &
  (
    | {
        src?: string;
        file?: ProtoFile;
        abstractData?: string;
        alt?: string;
      }
    | {
        src?: undefined;
        abstractData?: string;
        file: { url: string; imageSize: [number, number]; abstractData?: string | null } | null;
        alt?: string;
      }
  )) => {
  const url = src ?? file?.url ?? "/empty.png";
  const [width, height] = [props.width ?? file?.imageSize[0], props.height ?? file?.imageSize[1]];

  const blurDataURL = abstractData ?? file?.abstractData;
  const isPriority = Boolean(priority || preload);

  if (getEnv().renderMode === "csr")
    return (
      <CsrImage
        src={src}
        file={file}
        abstractData={abstractData}
        className={className}
        priority={priority}
        preload={preload}
        quality={quality}
        unoptimized={unoptimized}
        {...props}
      />
    );

  const optimized = getOptimizedImageAttrs({
    src: url,
    width,
    sizes: props.sizes,
    quality,
    unoptimized,
  });

  if (isPriority) {
    preloadResource(optimized.src, {
      as: "image",
      imageSrcSet: optimized.srcSet,
      imageSizes: props.sizes,
      fetchPriority: "high",
    });
  }

  const { fill, ...imgProps } = props;

  return (
    <img
      // <NextImage
      src={optimized.src}
      srcSet={optimized.srcSet}
      sizes={props.sizes}
      // fill={props.fill ?? (!width && !height)}
      width={width}
      height={height}
      className={clsx("object-cover", className)}
      alt={alt ?? "image"}
      loading={props.loading ?? (isPriority ? "eager" : "lazy")}
      decoding={props.decoding ?? "async"}
      fetchPriority={props.fetchPriority ?? (isPriority ? "high" : undefined)}
      {...(blurDataURL ? { placeholder: "blur", blurDataURL } : {})}
      {...imgProps}
    />
  );
};

function getOptimizedImageAttrs({
  src,
  width,
  sizes,
  quality,
  unoptimized,
}: {
  src: string;
  width?: number | string;
  sizes?: string;
  quality?: number;
  unoptimized?: boolean;
}): { src: string; srcSet?: string } {
  if (unoptimized || shouldBypassOptimization(src)) return { src };

  const q = getImageQuality(quality);
  const numericWidth = typeof width === "number" ? width : typeof width === "string" ? Number.parseInt(width, 10) : 0;

  if (Number.isFinite(numericWidth) && numericWidth > 0 && !sizes) {
    const oneX = pickNearestWidth(DEFAULT_IMAGE_WIDTHS, numericWidth);
    const twoX = pickNearestWidth(DEFAULT_IMAGE_WIDTHS, numericWidth * 2);
    const candidates = [...new Set([oneX, twoX])];
    return {
      src: getImageOptimizerUrl(src, oneX, q),
      srcSet: candidates.map((w, index) => `${getImageOptimizerUrl(src, w, q)} ${index + 1}x`).join(", "),
    };
  }

  const candidates = sizes ? DEFAULT_IMAGE_WIDTHS : DEFAULT_IMAGE_DEVICE_SIZES;
  const fallbackWidth = candidates[candidates.length - 1] ?? 384;
  return {
    src: getImageOptimizerUrl(src, fallbackWidth, q),
    srcSet: candidates.map((w) => `${getImageOptimizerUrl(src, w, q)} ${w}w`).join(", "),
  };
}

function getImageOptimizerUrl(src: string, width: number, quality: number) {
  const params = new URLSearchParams({ url: src, w: String(width), q: String(quality) });
  return `/_akan/image?${params.toString()}`;
}

function pickNearestWidth(widths: number[], requested: number) {
  return widths.find((w) => w >= requested) ?? widths[widths.length - 1] ?? requested;
}

function getImageQuality(quality: unknown) {
  return typeof quality === "number" && Number.isFinite(quality) ? quality : DEFAULT_IMAGE_QUALITY;
}

function shouldBypassOptimization(src: string) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return true;
  const path = src.split("?", 1)[0]?.toLowerCase() ?? "";
  return path.endsWith(".svg");
}
