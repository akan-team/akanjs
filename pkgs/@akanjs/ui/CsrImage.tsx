"use client";

/* eslint-disable @next/next/no-img-element */
import { ProtoFile } from "@akanjs/constant";
import { ImageProps } from "next/image";

const getNewImage = () => new Image();

export const CsrImage = ({
  src,
  file,
  className,
  abstractData,
  ...props
}: Omit<ImageProps, "alt" | "src"> & {
  src?: string;
  file?: ProtoFile | { url: string; imageSize: [number, number]; abstractData?: string | null } | null;
  abstractData?: string;
}) => {
  const url = src ?? file?.url ?? "/empty.png";
  const [width, height] = [props.width ?? file?.imageSize[0], props.height ?? file?.imageSize[1]];
  const defaultAbstractData =
    "data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mN8//HLfwYiAOOoQvoqBABbWyZJf74GZgAAAABJRU5ErkJggg==";
  //CSRImage로 파일 만들어서 불러서 변경
  const blurDataURL = abstractData ?? file?.abstractData ?? defaultAbstractData;
  // const [loadedImage, setLoadedImage] = useState(false);
  // const fetchImage = (src) => {
  //   const loadingImage = getNewImage();
  //   loadingImage.src = src;
  //   loadingImage.onload = () => {
  //     setLoadedImage(true);
  //   };
  // };

  // useEffect(() => {
  //   // fetchImage(url);
  // }, []);
  const { priority, ...csrProps } = props;
  return (
    <img
      src={url}
      data-src={blurDataURL}
      width={width}
      height={height}
      // className={clsx("object-cover w-full", className)}
      className={className}
      alt="image"
      placeholder="blur"
      {...csrProps}
    />
  );
};
