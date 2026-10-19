import { getEnv } from "akanjs/base";
import { cn } from "akanjs/client";
import type { ProtoLightFile } from "akanjs/constant";
import type { ImgHTMLAttributes } from "react";
import { preload as preloadResource } from "react-dom";

import { CsrImage } from "./CsrImage";

type ImageLikeFile = ProtoLightFile | { url: string; imageSize: [number, number]; abstractData?: string | null } | null;

const DEFAULT_IMAGE_DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const DEFAULT_IMAGE_SIZES = [32, 48, 64, 96, 128, 256, 384];
const DEFAULT_IMAGE_WIDTHS = [...new Set([...DEFAULT_IMAGE_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES])].sort(
  (a, b) => a - b,
);
const DEFAULT_IMAGE_QUALITY = 75;
//? A transparent pixel, so an image with no url fills its box without a request for an asset no app ships.
const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

type NativeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src" | "srcSet"> & {
  fill?: boolean;
  /** Accepted for next/image compatibility; an `<img>` has no such attribute, so it draws nothing. */
  placeholder?: string;
  /** Accepted for next/image compatibility; an `<img>` has no such attribute, so it draws nothing. */
  blurDataURL?: string;
};

type AkanImageProps = NativeImageProps & {
  /** Takes precedence over `file.url`. */
  src?: string;
  file?: ImageLikeFile;
  /** Overrides `file.abstractData`, which no render path draws as a placeholder. */
  abstractData?: string | null;
  /** Defaults to "image". */
  alt?: string;
  /** Optimizer quality, 75 by default. */
  quality?: number;
  /** Loads eagerly at high fetch priority, and preloads during SSR. */
  priority?: boolean;
  /** Preloads the resource during SSR. */
  preload?: boolean;
  /** Serves the original `src`, skipping the optimizer. */
  unoptimized?: boolean;
};

export const Image = (
  imageProps: AkanImageProps &
    (
      | {
          src?: string;
          file?: ProtoLightFile;
          abstractData?: string | null;
          alt?: string;
        }
      | {
          src?: undefined;
          abstractData?: string | null;
          file: { url: string; imageSize: [number, number]; abstractData?: string | null } | null;
          alt?: string;
        }
    ),
) => {
  if (getEnv().renderMode === "csr") return <CsrImage {...imageProps} />;
  const { src, file, className, abstractData, alt, quality, priority, preload, unoptimized, ...props } = imageProps;
  const url = src || file?.url || null;
  const [width, height] = [props.width ?? file?.imageSize[0], props.height ?? file?.imageSize[1]];

  const isPriority = Boolean(priority || preload);

  const optimized = url
    ? getOptimizedImageAttrs({ src: url, width, sizes: props.sizes, quality, unoptimized })
    : { src: EMPTY_IMAGE, srcSet: undefined };

  if (isPriority && url) {
    preloadResource(optimized.src, {
      as: "image",
      imageSrcSet: optimized.srcSet,
      imageSizes: props.sizes,
      fetchPriority: "high",
    });
  }

  const { fill, placeholder, blurDataURL, ...imgProps } = props;

  return (
    <img
      src={optimized.src}
      srcSet={optimized.srcSet}
      sizes={props.sizes}
      width={width}
      height={height}
      className={cn("object-cover", !url && "bg-muted", className)}
      alt={alt ?? "image"}
      loading={props.loading ?? (isPriority ? "eager" : "lazy")}
      decoding={props.decoding ?? "async"}
      fetchPriority={props.fetchPriority ?? (isPriority ? "high" : undefined)}
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
