"use client";
import { cn } from "akanjs/client";
import { createOverridable } from "../UiOverride";

export interface MenuRow {
  name: string;
  description?: string;
  /** The argument names a prompt takes, shown so a user knows what to type after the name. */
  hint?: string;
  pick: () => void;
}

export interface MenuProps {
  className?: string;
  rows: MenuRow[];
  /** Index the arrows are on. Enter picks it and Tab completes its name, so it has to be visible. */
  selected: number;
  onPick: (row: MenuRow) => void;
}

/** The `/` menu: this chat's own commands first, then the app's `prompt()` endpoints. */
export const DefaultMenu = ({ className, rows, selected, onPick }: MenuProps) => {
  if (!rows.length) return null;
  return (
    <div
      className={cn(
        "scrollbar-thin flex max-h-40 flex-col overflow-y-auto border-foreground/5 border-t py-1",
        className,
      )}
      role="listbox"
    >
      {rows.map((row, idx) => (
        <button
          aria-selected={idx === selected}
          className={cn(
            "flex items-baseline gap-2 px-4 py-1.5 text-left hover:bg-muted",
            idx === selected && "bg-muted",
          )}
          key={row.name}
          onClick={() => onPick(row)}
          role="option"
          type="button"
        >
          <span className="shrink-0 font-mono text-xs">/{row.name}</span>
          {row.hint ? <span className="shrink-0 font-mono text-[10px] text-foreground/40">{row.hint}</span> : null}
          {row.description ? (
            <span className="ml-auto truncate text-[10px] text-foreground/50">{row.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
};

export default createOverridable("AgentMenu", DefaultMenu);
