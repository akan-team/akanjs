import { cn } from "akanjs/client";
import type { ReactNode } from "react";

import { CodeText } from "./CodeText";

export interface MatrixColumn {
  key: string;
  label: ReactNode;
  code?: boolean;
  caption?: string;
}

export interface MatrixRow {
  name: ReactNode;
  desc?: ReactNode;
  marks: { [key: string]: boolean | undefined };
}

export interface MatrixGroup {
  label: ReactNode;
  rows: MatrixRow[];
}

interface MatrixProps {
  className?: string;
  type: string;
  columns: MatrixColumn[];
  groups: MatrixGroup[];
  markLabel: string;
  emptyLabel: string;
  countTemplate?: string;
}

const markSlot =
  "jelly tint-primary inline-flex size-5 shrink-0 items-center justify-center rounded-full font-black text-[0.6875rem] text-primary-foreground";
const emptySlot = "inline-block size-5 shrink-0 rounded-full border border-foreground/25 border-dashed";

export const Matrix = ({ className, type, columns, groups, markLabel, emptyLabel, countTemplate }: MatrixProps) => {
  const rows = groups.flatMap((group) => group.rows);
  return (
    <div className={cn("my-5", className)}>
      <div className="studio-lift overflow-x-auto rounded-2xl border border-foreground/8 bg-card/80 sm:px-1">
        <div
          className="grid text-sm"
          style={{
            gridTemplateColumns: `minmax(min-content, 1fr) repeat(${columns.length}, minmax(min-content, auto))`,
          }}
        >
          <div className="col-span-full grid grid-cols-subgrid border-foreground/8 border-b py-2.5">
            <div className="self-end px-2 font-bold text-foreground/45 text-xs uppercase tracking-[0.12em] sm:px-3">
              {type}
            </div>
            {columns.map((column) => (
              <div key={column.key} className="min-w-11 self-end px-0.5 text-center sm:px-2">
                <div
                  className={cn(
                    "whitespace-nowrap font-bold text-foreground text-xs sm:text-sm",
                    column.code && "font-mono",
                  )}
                >
                  <CodeText>{column.label}</CodeText>
                </div>
                {column.caption ? (
                  <div className="wrap-anywhere hidden font-mono text-primary text-xs sm:block">{column.caption}</div>
                ) : null}
                {countTemplate ? (
                  <div className="mt-0.5 whitespace-nowrap text-foreground/50 text-xs">
                    {countTemplate.replace("{num}", String(rows.filter((row) => row.marks[column.key]).length))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {groups.map((group, groupIdx) => (
            <div key={groupIdx} className="col-span-full grid grid-cols-subgrid">
              <div className="col-span-full bg-foreground/4 px-2 py-1.5 font-bold text-foreground/55 text-xs sm:rounded-lg sm:px-3">
                <CodeText>{group.label}</CodeText>
              </div>
              {group.rows.map((row, idx) => (
                <div
                  key={idx}
                  className="col-span-full grid grid-cols-subgrid border-foreground/6 border-t py-1.5 transition-colors hover:bg-foreground/3"
                >
                  <div className="px-2 font-mono font-semibold text-foreground text-xs leading-5 sm:whitespace-nowrap sm:px-3 sm:text-sm">
                    {row.name}
                  </div>
                  {columns.map((column) => (
                    <div key={column.key} className="flex justify-center px-0.5 sm:px-2">
                      {row.marks[column.key] ? <span className={markSlot}>✓</span> : <span className={emptySlot} />}
                    </div>
                  ))}
                  {row.desc ? (
                    <div className="col-span-full mt-0.5 px-2 text-foreground/70 text-xs leading-relaxed sm:col-span-1 sm:px-3 sm:text-sm">
                      <CodeText>{row.desc}</CodeText>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-foreground/60 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className={markSlot}>✓</span>
          {markLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={emptySlot} />
          {emptyLabel}
        </span>
      </div>
    </div>
  );
};
