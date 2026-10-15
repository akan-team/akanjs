"use client";
import { usePage } from "@libs/util/client";
import { dayjs } from "akanjs/base";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Area, Point } from "react-easy-crop";
import Cropper from "react-easy-crop";
import type { CropRef } from "./cropImage.type";
import { createImage } from "./cropImage.util";
import { buttonRecipe } from "./Recipe";

export type { CropRef } from "./cropImage.type";

//? iOS Safari draws nothing into a canvas larger than this, so a bigger source is zoomed in until the crop fits.
const maxCanvasArea = 4096 * 4096;

interface CropImageProps {
  src: string;
  aspectRatio?: number[];
  download?: boolean;
}

export const CropImage = forwardRef<CropRef, CropImageProps>(
  ({ src, aspectRatio = [16, 9], download }: CropImageProps, ref) => {
    const { l } = usePage();
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area>();
    const [zoom, setZoom] = useState(1);
    const [minZoom, setMinZoom] = useState(1);
    const cropperRef = useRef<Cropper | null>(null);
    const aspect = aspectRatio[0] / aspectRatio[1];

    const getCropImage = async () => {
      if (!croppedAreaPixels) return null;
      const image = await createImage(src);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return null;
      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;
      context.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
      );
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg"));
    };

    const croppedFilename = () => `${dayjs().format("YYYYMMDD-HHmmss")}-cropped.jpg`;

    const getFileStream = async () => {
      const blob = await getCropImage();
      return blob ? new File([blob], croppedFilename(), { type: "image/jpeg" }) : undefined;
    };

    const downloadCroppedImage = async () => {
      const blob = await getCropImage();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = croppedFilename();
      document.body.appendChild(link);
      link.click();
      link.remove();
      //? Firefox and Safari start a blob download asynchronously; revoking at once can cancel it.
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    };

    useImperativeHandle(ref, () => ({ getCropImage, getFileStream, downloadCroppedImage }));

    useEffect(() => {
      if (!src) return;
      void createImage(src).then((image) => {
        if (image.width * image.height < maxCanvasArea) return;
        const cropData = cropperRef.current?.getCropData();
        if (!cropData) return;
        const fitZoom =
          Math.floor(((cropData.croppedAreaPixels.width * cropData.croppedAreaPixels.height) / maxCanvasArea) * 100) /
          100;
        setMinZoom(fitZoom);
        setZoom(fitZoom);
      });
    }, [src]);

    if (!src) return null;
    return (
      <div className="relative flex h-[60vh] w-full items-center justify-center bg-black">
        <Cropper
          ref={cropperRef}
          image={src}
          minZoom={minZoom}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onCropComplete={(_croppedArea, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
          onZoomChange={setZoom}
        />
        {download ? (
          <button
            type="button"
            className={buttonRecipe({ variant: "default" })}
            onClick={() => void downloadCroppedImage()}
          >
            {l("util.downloadCroppedImage")}
          </button>
        ) : null}
      </div>
    );
  },
);
