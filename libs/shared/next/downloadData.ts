"use client";
import { deepObjectify } from "@akanjs/common";
import { saveAs } from "file-saver";

interface DownloadDataProps {
  type: "json" | "csv";
  data: any;
  filename: string;
}
export const downloadData = ({ type, data, filename }: DownloadDataProps) => {
  if (type === "json") {
    const json = JSON.stringify(deepObjectify(data, { serializable: true }), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    saveAs(blob, filename);
  }
  // TODO: csv
};
