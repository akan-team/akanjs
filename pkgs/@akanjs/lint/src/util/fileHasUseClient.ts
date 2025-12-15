/* eslint-disable */
export const fileHasUseClient = (context: any) => {
  const firstLineIdx = context.sourceCode.lines.findIndex((line) => line.trim() !== "");
  return { hasUseClient: context.sourceCode.lines[firstLineIdx].includes('"use client"'), firstLineIdx };
};
