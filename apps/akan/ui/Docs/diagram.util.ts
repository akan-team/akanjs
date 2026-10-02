export type FlowTone = "default" | "primary" | "info" | "success" | "muted" | "danger";

export const flowToneClass: { [key in FlowTone]: string } = {
  default: "border-foreground/10 bg-background text-foreground",
  primary: "border-primary/40 bg-primary/10 text-foreground",
  info: "border-info/30 bg-info/10 text-foreground",
  success: "border-success/30 bg-success/10 text-foreground",
  muted: "border-border border-dashed bg-transparent text-foreground/70",
  danger: "border-destructive/30 bg-destructive/10 text-foreground",
};

export const diagramLineHeight = 17;
export const diagramCharWidth = 6.4;
export const diagramMinBoxWidth = 104;
export const diagramMaxBoxWidth = 268;

// 노드 글자가 9px 아래로 내려가면 읽히지 않는다 — 이 배율 밑으로는 줄이는 대신 가로로 스크롤한다.
export const diagramMinScale = 0.75;

const wideCodePoint = 0x2e80;

// A CJK glyph takes about twice the width of a latin one at the same font size.
const unitsOf = (text: string) =>
  [...text].reduce((sum, char) => sum + ((char.codePointAt(0) ?? 0) >= wideCodePoint ? 2 : 1), 0);

export const measureBoxWidth = (label: string, lines: string[] = []) => {
  const longest = Math.max(unitsOf(label), ...lines.map(unitsOf));
  const width = Math.round(longest * diagramCharWidth + 30);
  return Math.min(diagramMaxBoxWidth, Math.max(diagramMinBoxWidth, width));
};

export const measureTextWidth = (text: string) => Math.round(unitsOf(text) * diagramCharWidth);
