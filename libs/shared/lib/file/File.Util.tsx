"use client";
import { fetch, st } from "@libs/shared/client";
import { buttonRecipe } from "@libs/util/ui";
import { cn, getCookie } from "akanjs/client";
import { Image, Loading } from "akanjs/ui";
import { lazy } from "akanjs/webkit";
import { type ReactNode, useState } from "react";
import { AiOutlineCheckCircle, AiOutlineLoading } from "react-icons/ai";

const ImageViewer = lazy(() => import("react-simple-image-viewer"), { ssr: false });

interface ImageGalleryProps {
  srcs: string[];
}
export const ImageGallery = ({ srcs }: ImageGalleryProps) => {
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

interface DownloadProps {
  className?: string;
  url: string;
  filename: string;
  onClick?: () => void;
  children?: ReactNode;
}
export const Download = ({ className, onClick, url, filename, children }: DownloadProps) => {
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
      className={cn(
        "flex items-center justify-start duration-500",
        className,
        loading === true && "cursor-default opacity-80",
        loading === false && "cursor-pointer",
      )}
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
  const exportPdf = async () => {
    if (loading) return;
    setLoading(true);
    const fullPath =
      window.location.href +
      (window.location.href.includes("jwt") ? "" : window.location.href.includes("?") ? `&jwt=${jwt}` : `?jwt=${jwt}`);

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
  };
  st.tool("exportPdf", { settle: false, guard: () => (loading === true ? "The PDF is already being made." : true) })
    .desc("Render the page on screen to a PDF and save it.")
    .exec(exportPdf);
  return (
    <button
      onClick={() => void exportPdf()}
      className={cn(buttonRecipe({ variant: "primary" }), loading === true && "bg-primary/80")}
      disabled={loading === true}
    >
      <div className="w-3">
        {loading === true ? (
          <AiOutlineLoading className="animate-spin text-xs" />
        ) : loading === false ? (
          <AiOutlineCheckCircle className="animate-pop-300" />
        ) : null}
      </div>
      Export PDF
    </button>
  );
};
