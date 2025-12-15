"use client";
import { dayjs } from "@akanjs/base";
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Area, MediaSize, Point, Size } from "react-easy-crop";
import Cropper from "react-easy-crop";

const createImage = async (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve(image);
    });
    image.addEventListener("error", (error) => {
      reject(error);
    });
    image.setAttribute("crossOrigin", "anonymous"); // needed to avoid cross-origin issues on CodeSandbox
    image.src = url;
  });

const getRadianAngle = (degreeValue: number) => {
  return (degreeValue * Math.PI) / 180;
};

/**
 * Returns the new bounding area of a rotated rectangle.
 */
const rotateSize = (width: number, height: number, rotation: number) => {
  const rotRad = getRadianAngle(rotation);

  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
};

interface CropProps {
  src: string;
  aspectRatio?: number[];
  download?: boolean;
}

export interface CropRef {
  getCropImage: () => Promise<string | null | undefined>;
  getFileStream: () => Promise<File | undefined>;
  downloadCroppedImage: () => Promise<void>;
}

/**
 * 이미지를 크롭하는 컴포넌트
 * @param src 이미지 주소
 * @param aspectForm 가로세로 비율 [가로, 세로] default: [16, 9]
 * @param download 다운로드 버튼 표시 여부
 * @param ref CropRef
 * @returns CropImage
 *
 */

export const CropImage = forwardRef<CropRef, CropProps>(({ src, aspectRatio = [16, 9], download }: CropProps, ref) => {
  /**------------ */
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area>();
  const [zoom, setZoom] = useState(1);
  /**------------ */
  const onCropComplete = (croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const clientHeight = window.document.body.clientHeight;
  const divRef = useRef<HTMLDivElement | null>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const [maxCrop, setMaxCrop] = useState<Size | undefined>();
  const [mediaSize, setMediaSize] = useState<MediaSize | undefined>();
  const [maxZoom, setMaxZoom] = useState<number>(1);
  const [maxWidth, setMaxWidth] = useState<number>(0);
  const [maxHeight, setMaxHeight] = useState<number>(0);
  const aspect = aspectRatio[0] / aspectRatio[1];
  const height = clientHeight * 0.6;

  const getCropImage = async () => {
    if (!croppedAreaPixels) return;
    const image = await createImage(src);
    // if (!image) return null;
    //! TODO:회전 처리인데 ㅈ같은 IOS에서 4096 넘어가는 것 때매 안됨

    // const canvas = document.createElement("canvas");
    // const ctx = canvas.getContext("2d");
    // if (!ctx) return null;

    // const rotRad = getRadianAngle(0);
    // // const rotRad = getRadianAngle(rotation);

    // // calculate bounding box of the rotated image

    // // const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, 0);
    // const isOver = image.width * image.height > 4096 * 4096;
    // const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    //   isOver ? maxWidth : image.width,
    //   isOver ? maxHeight : image.height,
    //   0
    // );

    // // set canvas size to match the bounding box
    // canvas.width = bBoxWidth;
    // canvas.height = bBoxHeight;
    // // translate canvas context to a central location to allow rotating and flipping around the center
    // ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
    // ctx.rotate(rotRad);
    // // ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
    // ctx.translate(-image.width / 2, -image.height / 2);

    // // draw rotated image
    // ctx.drawImage(image, 0, 0);
    const croppedCanvas = document.createElement("canvas");
    const croppedCtx = croppedCanvas.getContext("2d");

    if (!croppedCtx) return null;
    croppedCanvas.width = croppedAreaPixels.width;
    croppedCanvas.height = croppedAreaPixels.height;
    // Draw the cropped image onto the new canvas
    croppedCtx.drawImage(
      image,
      croppedAreaPixels.x,
      croppedAreaPixels.y,
      croppedAreaPixels.width,
      croppedAreaPixels.height,
      0,
      0,
      croppedAreaPixels.width,
      croppedAreaPixels.height
    );

    return await new Promise<string | null>((resolve, reject) => {
      croppedCanvas.toBlob((file) => {
        if (!file) {
          reject(new Error("Canvas is empty"));
          return;
        }
        resolve(window.URL.createObjectURL(file));
      }, "image/jpeg");
    });
  };

  const downloadCroppedImage = async () => {
    const cropped = await getCropImage();
    if (!cropped) return;
    const link = document.createElement("a");
    link.href = cropped;
    link.setAttribute("download", `${dayjs().format("YYYY-MM-DD-hh:mm:ss")}-croppedImage.png`); // 다운로드될 파일 이름 지정
    document.body.appendChild(link); // 필요한 경우에만 DOM에 추가
    link.click();
    link.remove(); // 다운로드 후 링크 요소 제거
  };

  const getFileStream = async () => {
    const cropped = await getCropImage();
    if (!cropped) return;
    const blob = await (await fetch(cropped)).blob();

    const file = new File([blob], `${dayjs().format("YYYY-MM-DD-hh:mm:ss")}-croppedImage.png}.png`, {
      type: "image/png",
    });
    return file;
  };

  useImperativeHandle(ref, () => ({
    getCropImage: getCropImage,
    getFileStream: getFileStream,
    downloadCroppedImage: downloadCroppedImage,
  }));
  function limitSize({ width, height }: { width: number; height: number }, maximumPixels: number) {
    const requiredPixels = width * height;
    if (requiredPixels <= maximumPixels) return { width, height };

    const scalar = Math.sqrt(maximumPixels) / Math.sqrt(requiredPixels);
    return {
      width: Math.floor(width * scalar),
      height: Math.floor(height * scalar),
    };
  }

  useEffect(() => {
    if (!src) return;
    void (async () => {
      const image = await createImage(src);
      if (image.width * image.height < 4096 * 4096) {
        setMaxCrop(undefined);
        return;
      }

      if (cropperRef.current) {
        const cropData = cropperRef.current.getCropData();
        if (!cropData) return;
        const zoom =
          Math.floor(((cropData.croppedAreaPixels.width * cropData.croppedAreaPixels.height) / (4096 * 4096)) * 100) /
          100;
        setMaxZoom(zoom);
        setZoom(zoom);
      }
    })();
  }, [src]);

  if (!src) return <></>;
  return (
    <>
      <div
        ref={divRef}
        className="relative flex w-full items-center justify-center bg-black"
        style={{
          height,
        }}
      >
        <Cropper
          ref={cropperRef}
          image={src}
          minZoom={maxZoom}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onCropComplete={onCropComplete}
          onZoomChange={setZoom}
        />

        {download && (
          <button className="btn" onClick={() => void downloadCroppedImage()}>
            download crop Image
          </button>
        )}
      </div>
    </>
  );
});
