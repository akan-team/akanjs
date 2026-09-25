import type { EditorThemeClasses } from "lexical";

/** Callout color variants (5). Kept out of `EditorThemeClasses` (which has no
 *  index signature) and applied directly by `CalloutNode.createDOM`. */
export type CalloutVariant = "default" | "info" | "success" | "warning" | "error";

const CALLOUT_BASE = "my-3 rounded-md border border-l-4 py-2 pr-3 pl-4 leading-7";
export const CALLOUT_VARIANTS: Record<CalloutVariant, string> = {
  default: `${CALLOUT_BASE} border-foreground/15 border-l-foreground/40 bg-muted/60`,
  info: `${CALLOUT_BASE} border-info/30 border-l-info bg-info/10`,
  success: `${CALLOUT_BASE} border-success/30 border-l-success bg-success/10`,
  warning: `${CALLOUT_BASE} border-warning/30 border-l-warning bg-warning/10`,
  error: `${CALLOUT_BASE} border-destructive/30 border-l-destructive bg-destructive/10`,
};

/** Mention chip skin. Same reason as the callout variants: `EditorThemeClasses`
 *  has no index signature, so `MentionNode.createDOM` applies it directly. */
export const MENTION_CHIP =
  "cursor-pointer rounded-sm bg-primary/10 px-1 font-medium text-primary transition-colors hover:bg-primary/20";

/** Avatar half of the chip, added only when the mention carries an `imageUrl`.
 *  A `::before` rather than a child element: the chip is a `TextNode`, so any real
 *  child inside its DOM would be overwritten by text reconciliation. */
export const MENTION_CHIP_AVATAR =
  "before:mr-1 before:inline-block before:size-[1.05em] before:rounded-full before:bg-center before:bg-cover before:align-[-0.15em] before:content-[''] before:[background-image:var(--mention-avatar)]";

/**
 * Akan editor theme — maps Lexical node types to Tailwind/daisyUI classes.
 *
 * Design principle (carried over from the Yoopta `applyAkanTheme`): skin the
 * editor purely through class names, injecting **no global CSS**, so it can
 * never clobber the app's layered Tailwind utilities. Classes below mirror the
 * look defined in the old `theme/blocks.tsx` so edit and read-only renders stay
 * visually identical across the migration.
 */
export const akanEditorTheme: EditorThemeClasses = {
  paragraph: "mt-2 leading-7",
  heading: {
    h1: "mt-8 scroll-m-20 font-extrabold text-4xl tracking-tight lg:text-5xl",
    h2: "mt-6 scroll-m-20 font-semibold text-3xl tracking-tight transition-colors",
    h3: "mt-4 scroll-m-20 font-semibold text-2xl tracking-tight",
  },
  quote: "mt-4 border-border border-l-2 pl-6 leading-7",
  list: {
    ul: "my-0 ml-6 list-disc leading-7",
    ol: "my-0 ml-6 list-decimal leading-7",
    listitem: "pl-2",
    // Checklist (Todo) — checkbox drawn via Tailwind `before:`/`after:` pseudo utilities
    // (no global CSS). Checked = filled primary box with a check glyph + struck text.
    listitemUnchecked:
      "relative ml-0 list-none pl-7 leading-7 before:absolute before:top-1.5 before:left-1 before:h-4 before:w-4 before:rounded before:border before:border-foreground/40 before:content-['']",
    listitemChecked:
      "relative ml-0 list-none pl-7 leading-7 text-foreground/60 line-through before:absolute before:top-1.5 before:left-1 before:h-4 before:w-4 before:rounded before:border before:border-primary before:bg-primary before:content-[''] after:absolute after:top-1.5 after:left-[0.4rem] after:h-2.5 after:w-1.5 after:rotate-45 after:border-primary-foreground after:border-r-2 after:border-b-2 after:content-['']",
    nested: {
      listitem: "list-none",
    },
  },
  link: "font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80",
  text: {
    bold: "font-bold",
    italic: "italic",
    underline: "underline underline-offset-2",
    strikethrough: "line-through",
    underlineStrikethrough: "underline line-through underline-offset-2",
    code: "rounded bg-muted px-1.5 py-0.5 font-mono text-sm",
    highlight: "rounded bg-warning px-0.5 dark:bg-warning/30",
  },
  code: "mt-4 block overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm leading-6",
  // Render as a filled line, not a border: Tailwind preflight zeroes `<hr>`
  // border widths, so `border-*` alone is invisible.
  hr: "my-4 h-px border-none bg-foreground/25",
  // Selected divider — matches the selection ring the media nodes draw.
  hrSelected: "outline outline-2 outline-primary outline-offset-4",
  // Table (Phase 3b) — `@lexical/table` renders <table>/<tr>/<td|th>; skin them
  // with daisyUI-flavored borders. Cells get relative positioning so the cell
  // selection overlay and (future) resizer sit correctly.
  table: "my-3 w-full table-fixed border-collapse overflow-hidden rounded-md border border-foreground/20",
  tableRow: "",
  tableCell: "relative min-w-24 border border-foreground/15 px-3 py-1.5 align-top leading-7",
  tableCellHeader: "bg-muted/70 text-left font-semibold",
  tableCellSelected: "bg-primary/10",
  tableSelection: "bg-primary/10",
  tableScrollableWrapper: "my-3 overflow-x-auto",
  // Prism token → class map for syntax-highlighted code blocks.
  codeHighlight: {
    atrule: "text-accent",
    attr: "text-info",
    boolean: "text-warning",
    builtin: "text-success",
    cdata: "text-foreground/50",
    char: "text-success",
    class: "text-warning",
    "class-name": "text-warning",
    comment: "text-foreground/40 italic",
    constant: "text-warning",
    deleted: "text-destructive",
    doctype: "text-foreground/40",
    entity: "text-destructive",
    function: "text-info",
    important: "text-warning",
    inserted: "text-success",
    keyword: "text-accent",
    namespace: "text-warning",
    number: "text-warning",
    operator: "text-foreground/70",
    prolog: "text-foreground/40",
    property: "text-info",
    punctuation: "text-foreground/60",
    regex: "text-success",
    selector: "text-success",
    string: "text-success",
    symbol: "text-warning",
    tag: "text-destructive",
    url: "text-info",
    variable: "text-warning",
  },
};
