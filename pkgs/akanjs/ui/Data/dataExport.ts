import type { DataColumn } from "akanjs/client";
import { deepObjectify, isDayjs } from "akanjs/common";

export const columnKey = (column: DataColumn<any>) => (typeof column === "string" ? column : (column.key as string));

/** `render` returns JSX, so an export reads `value` when the column declares one and the raw field otherwise. */
const columnValue = (column: DataColumn<any>, model: Record<string, unknown>) => {
  if (typeof column === "string") return model[column];
  const raw = model[column.key as string];
  return column.value ? column.value(raw, model as never) : raw;
};

const csvCell = (value: unknown) => {
  const text =
    value === null || value === undefined
      ? ""
      : isDayjs(value)
        ? value.toISOString()
        : value instanceof Date
          ? value.toISOString()
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
  return /["\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsvBlob = (
  columns: DataColumn<any>[],
  models: Record<string, unknown>[],
  title: (column: DataColumn<any>) => string,
) => {
  const rows = [
    columns.map((column) => csvCell(title(column))),
    ...models.map((model) => columns.map((column) => csvCell(columnValue(column, model)))),
  ];
  // Excel reads a UTF-8 csv as the local codepage unless it opens with a BOM, which mangles every non-ASCII label.
  const body = `\uFEFF${rows.map((row) => row.join(",")).join("\r\n")}`;
  return new Blob([body], { type: "text/csv;charset=utf-8" });
};

export const toJsonBlob = (models: unknown[]) =>
  new Blob([JSON.stringify(deepObjectify(models, { serializable: true }), null, 2)], { type: "application/json" });

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
