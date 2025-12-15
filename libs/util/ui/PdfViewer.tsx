"use client";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

import React, { ReactNode, useEffect, useRef, useState } from "react";
import { BiChevronLeft, BiChevronRight } from "react-icons/bi";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export interface PdfViewerProps {
  className?: string;
  file: string;
  navigation?: ({ numPages, currentPage }: { numPages: number; currentPage: number }) => ReactNode;
  loadSuccess?: ({ numPages }: { numPages: number }) => void;
  renderSuccess?: () => void;
}

export const PdfViewer = ({ className, file, navigation, loadSuccess, renderSuccess }: PdfViewerProps) => {
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const divRef = useRef<HTMLDivElement>(null);
  const [divWidth, setDivWidth] = useState(0);

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
