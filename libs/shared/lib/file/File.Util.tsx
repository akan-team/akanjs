"use client";
import { clsx, getCookie } from "@akanjs/client";
import { lazy } from "@akanjs/next";
import { Image, Loading } from "@akanjs/ui";
import { fetch, st } from "@shared/client";
import { useState } from "react";
import { AiOutlineCheckCircle } from "react-icons/ai";

const ImageViewer = lazy(() => import("react-simple-image-viewer"), { ssr: false });

interface FileZoneImageGalleryProps {
  srcs: string[];
}
export const ImageGallery = ({ srcs }: FileZoneImageGalleryProps) => {
  const fileModal = st.use.fileModal();
  const [imgIdx, setImgIdx] = useState(0);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        {srcs.map((src, idx) => (
          <Image
            key={idx}
            className="h-32 w-44 cursor-pointer object-cover"
            onClick={() => {
              setImgIdx(idx);
              st.do.setFileModal("imageGallery");
            }}
            src={src}
            width={176}
            height={128}
            placeholder="blur"
            blurDataURL="data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mN8//HLfwYiAOOoQvoqBABbWyZJf74GZgAAAABJRU5ErkJggg=="
          />
        ))}
      </div>
      {fileModal === "imageGallery" && (
        <ImageViewer
          src={srcs}
          currentIndex={imgIdx}
          onClose={() => {
            st.do.setFileModal(null);
          }}
          disableScroll={false}
          backgroundStyle={{ backgroundColor: "rgba(0,0,0,0.9)", zIndex: 1000 }}
          closeOnClickOutside={true}
        />
      )}
    </>
  );
};

interface Download {
  className?: string;
  url: string;
  filename: string;
  onClick?: () => void;
  children?: any;
}
export const Download = ({ className, onClick, url, filename, children }: Download) => {
  const [loading, setLoading] = useState<boolean | null>(false);

  return (
    <a
      href={url}
      download={filename}
      onClick={(e) => {
        if (loading) {
          e.preventDefault();
          return;
        }
        onClick?.();
        setLoading(true);
        // Let the browser handle the download via href/download attributes
        setTimeout(() => {
          setLoading(false);
        }, 1000); // Reset loading state after download initiates
      }}
      className={clsx("flex items-center justify-start duration-500", className, {
        "cursor-default opacity-80": loading === true,
        "cursor-pointer": loading === false,
      })}
    >
      {children}
      <div
        className="flex items-center justify-center text-center duration-300 data-[loading=false]:scale-0 data-[loading=true]:scale-100"
        data-loading={loading}
      >
        <Loading.Spin />
      </div>
    </a>
  );
};

export const ExportPDF = () => {
  const [loading, setLoading] = useState<boolean | null>(null);
  const jwt = getCookie("jwt");
  return (
    <button
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        const fullPath =
          window.location.href +
          (window.location.href.includes("jwt")
            ? ""
            : window.location.href.includes("?")
              ? `&jwt=${jwt}`
              : `?jwt=${jwt}`);

        const file = await fetch.generatePdf(fullPath);
        const arrayBuffer = new Uint8Array(file as unknown as ArrayBuffer);
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "example.pdf";
        link.click();
        setLoading(false);
        // 메모리 정리
        URL.revokeObjectURL(url);
      }}
      className={clsx("btn btn-primary", {
        "bg-primary/80": loading === true,
      })}
      disabled={loading === true}
    >
      <div className="w-3">
        {loading === true ? (
          <>
            <span className="loading loading-spinner loading-xs" />
          </>
        ) : loading === false ? (
          <>
            <AiOutlineCheckCircle className="animate-pop-300" />
          </>
        ) : null}
      </div>
      Export PDF
    </button>
  );
};
