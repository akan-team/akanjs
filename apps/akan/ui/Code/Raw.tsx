import { transformerNotationDiff, transformerNotationHighlight } from "@shikijs/transformers";
import { clsx } from "akanjs/client";
import type { BundledLanguage, BundledTheme, ShikiTransformer } from "shiki";
import { createHighlighter } from "shiki";

import { Shiki_Client } from "./Shiki_Client";

const highlighter = createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: ["typescript", "bash"],
});

const defaultThemes = {
  light: "github-light",
  dark: "github-dark",
} as const satisfies Record<"light" | "dark", BundledTheme>;

const transformerLineNumbers: ShikiTransformer = {
  line(node, line) {
    node.children.unshift({
      type: "element",
      tagName: "span",
      properties: { class: "line-number" },
      children: [{ type: "text", value: String(line) }],
    });
  },
};

const transformerBashLine: ShikiTransformer = {
  line(node, line) {
    node.children.unshift({
      type: "element",
      tagName: "span",
      properties: { class: "line-number" },
      children: [{ type: "text", value: "$" }],
    });
  },
};

const transformerLineData: ShikiTransformer = {
  line(node, line) {
    node.properties["data-line"] = line;
  },
};

/**
 * Parses code for // [!code collapse:N] annotations and calculates focusLines.
 * The annotation collapses the next N lines (starting from the annotation line).
 * Returns { cleanedCode, focusLines } where focusLines are the VISIBLE line ranges.
 */
const parseCollapseAnnotations = (
  code: string,
): { cleanedCode: string; focusLines: [number, number][] | undefined } => {
  const lines = code.split("\n");
  const collapsePattern = /\/\/\s*\[!code\s+collapse:(\d+)\]/;
  const collapsedLines = new Set<number>();
  lines.forEach((line, index) => {
    const execResult = collapsePattern.exec(line);
    if (!execResult) return;
    const count = parseInt(execResult[1], 10);
    for (let i = 0; i < count; i++) collapsedLines.add(index + 1 + i); // +1 for 1-indexed line numbers
  });
  if (collapsedLines.size === 0) return { cleanedCode: code, focusLines: undefined };
  const cleanedCode = lines.map((line) => line.replace(collapsePattern, "").trimEnd()).join("\n");
  const totalLines = lines.length;
  const focusLines: [number, number][] = [];
  let rangeStart: number | null = null;

  for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
    const isVisible = !collapsedLines.has(lineNum);
    if (isVisible && rangeStart === null) rangeStart = lineNum;
    else if (!isVisible && rangeStart !== null) {
      focusLines.push([rangeStart, lineNum - 1]);
      rangeStart = null;
    }
  }
  if (rangeStart !== null) focusLines.push([rangeStart, totalLines]);
  return { cleanedCode, focusLines };
};

interface RawProps {
  className?: string;
  language?: BundledLanguage;
  theme?: BundledTheme;
  code: string;
  showLineNumbers?: boolean;
}

export const Raw = ({ className, language = "typescript", theme, code, showLineNumbers = true }: RawProps) => {
  const { cleanedCode, focusLines } = parseCollapseAnnotations(code);
  const htmlPromise = highlighter.then((highlighter) =>
    highlighter.codeToHtml(cleanedCode, {
      lang: language,
      ...(theme ? { theme } : { themes: defaultThemes }),
      transformers: [
        transformerNotationDiff({
          matchAlgorithm: "v3",
          classLineAdd: "code-diff code-add select-text",
          classLineRemove: "code-diff code-remove select-text",
        }),
        transformerNotationHighlight(),
        transformerLineData,
        ...(showLineNumbers ? (language === "bash" ? [transformerBashLine] : [transformerLineNumbers]) : []),
      ],
    }),
  );
  return <Shiki_Client className={clsx("w-max", className)} htmlPromise={htmlPromise} focusLines={focusLines} />;
};
