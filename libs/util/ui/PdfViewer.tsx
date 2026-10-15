"use client";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { usePage } from "@libs/util/client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { BiChevronLeft, BiChevronRight } from "react-icons/bi";

//? Served from libs/util/public: the bundler emits no worker file, and pdf.js refuses a worker of another version.
const pdfWorkerSrc = "/libs/util/pdf.worker.min.mjs";

export interface PdfViewerProps {
  className?: string;
  file: string;
  navigation?: ({ numPages, currentPage }: { numPages: number; currentPage: number }) => ReactNode;
  loadSuccess?: ({ numPages }: { numPages: number }) => void;
  renderSuccess?: () => void;
}

export const PdfViewer = ({ className, file, navigation, loadSuccess, renderSuccess }: PdfViewerProps) => {
  const { l } = usePage();
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const divRef = useRef<HTMLDivElement>(null);
  const [divWidth, setDivWidth] = useState(0);
  const [pdfComponents, setPdfComponents] = useState<{
    Document: typeof import("react-pdf").Document;
    Page: typeof import("react-pdf").Page;
  } | null>(null);

  useEffect(() => {
    import("react-pdf").then(({ Document, Page, pdfjs }) => {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
      setPdfComponents({ Document, Page });
    });
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDivWidth(entry.contentRect.width);
      }
    });

    if (divRef.current) {
      observer.observe(divRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  if (!pdfComponents) return <div className={className} ref={divRef} />;
  const { Document, Page } = pdfComponents;

  return (
    <div className={className} ref={divRef}>
      <Document
        file={file}
        onLoadSuccess={({ numPages }) => {
          setNumPages(numPages);
          loadSuccess?.({ numPages });
        }}
      >
        <Page
          pageNumber={currentPage}
          width={divWidth}
          onRenderSuccess={() => {
            renderSuccess?.();
          }}
        />
      </Document>
      {navigation ? (
        navigation({ numPages, currentPage })
      ) : (
        <div className="my-4 flex w-full items-center justify-center gap-4">
          <button
            type="button"
            aria-label={l("util.back")}
            onClick={() => {
              setCurrentPage(currentPage - 1);
            }}
            disabled={currentPage <= 1}
            className={currentPage <= 1 ? "cursor-not-allowed opacity-30" : "cursor-pointer opacity-100"}
          >
            <BiChevronLeft className="text-3xl" />
          </button>
          <span>
            {currentPage} / {numPages}
          </span>
          <button
            type="button"
            aria-label={l("util.next")}
            onClick={() => {
              setCurrentPage(currentPage + 1);
            }}
            disabled={currentPage >= numPages}
            className={currentPage >= numPages ? "cursor-not-allowed opacity-30" : "cursor-pointer opacity-100"}
          >
            <BiChevronRight className="text-3xl" />
          </button>
        </div>
      )}
    </div>
  );
};
