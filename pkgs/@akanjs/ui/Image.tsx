import { baseClientEnv } from "@akanjs/base";
import { clsx } from "@akanjs/client";
import { ProtoFile } from "@akanjs/constant";
import NextImage, { ImageProps } from "next/image";

import { CsrImage } from "./CsrImage";

export const Image = ({
  src,
  file,
  className,
  abstractData,
  alt,
  ...props
}: Omit<ImageProps, "alt" | "src"> &
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

  return baseClientEnv.renderMode === "csr" ? (
    <CsrImage src={src} file={file} abstractData={abstractData} className={className} {...props} />
  ) : (
    <NextImage
      src={url}
      fill={props.fill ?? (!width && !height)}
      width={width}
      height={height}
      className={clsx("object-cover", className)}
      alt={alt ?? "image"}
      {...(blurDataURL ? { placeholder: "blur", blurDataURL } : {})}
      {...props}
    />
  );
};
