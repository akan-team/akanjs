export const spliceText = (content: string, start: number, end: number, replacement: string) =>
  `${content.slice(0, start)}${replacement}${content.slice(end)}`;

export const lineStartAt = (content: string, position: number) =>
  content.lastIndexOf("\n", Math.max(0, position - 1)) + 1;

export const lineEndAt = (content: string, position: number) => {
  const end = content.indexOf("\n", position);
  return end < 0 ? content.length : end + 1;
};

export const lineIndentAt = (content: string, position: number) =>
  /^[ \t]*/.exec(content.slice(lineStartAt(content, position)))?.[0] ?? "";
