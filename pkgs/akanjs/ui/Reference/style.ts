import { cn } from "../../client/cn";

export type Tone = "info" | "success" | "warning" | "error" | "muted";

const toneFill: { [key in Tone]: string } = {
  info: "bg-info/15 text-info ring-info/25",
  success: "bg-success/15 text-success ring-success/25",
  warning: "bg-warning/15 text-warning ring-warning/25",
  error: "bg-destructive/15 text-destructive ring-destructive/25",
  muted: "bg-muted text-foreground/60 ring-border",
};

const toneBorder: { [key in Tone]: string } = {
  info: "border-info/40",
  success: "border-success/40",
  warning: "border-warning/40",
  error: "border-destructive/40",
  muted: "border-border",
};

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ring-1 ring-inset";

/** Shared vocabulary for the generated reference surfaces — Constant schema docs and Signal API docs. */
export const docUi = {
  card: "rounded-box border border-border bg-card",
  panel: "rounded-box border border-border bg-background",
  tablePanel: "overflow-x-auto rounded-box border border-border bg-background",
  sectionLabel: "font-semibold text-foreground/45 text-xs uppercase tracking-wider",
  sectionTitle: "font-bold text-xl",
  pageTitle: "font-bold text-3xl",
  sectionDescription: "text-foreground/70 text-sm",
  prose: "text-foreground/75 text-sm leading-relaxed",
  key: "font-medium font-mono",
  subLabel: "text-foreground/45 text-xs",
  tableClass:
    "w-full text-left text-sm [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:text-foreground/45 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_tbody_tr]:border-border/70 [&_tbody_tr]:border-t [&_tbody_tr]:transition-colors hover:[&_tbody_tr]:bg-muted/40",
  emptyPanel: "rounded-box border border-border border-dashed p-8 text-center text-foreground/40 text-sm",
};

export const docPill = (tone: Tone, className?: string) => cn(pill, toneFill[tone], className);

export const docBorder = (tone: Tone) => toneBorder[tone];

/** Absent optional cell. One glyph everywhere, so an empty column reads as empty rather than as data. */
export const docDash = "text-foreground/25";
