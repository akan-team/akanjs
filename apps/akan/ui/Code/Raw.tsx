import { transformerNotationDiff, transformerNotationHighlight } from "@shikijs/transformers";
import { cn } from "akanjs/client";
import type { BundledLanguage, ShikiTransformer } from "shiki";
import { createHighlighterCoreSync, hastToHtml } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import json from "shiki/langs/json.mjs";
import markdown from "shiki/langs/markdown.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import yaml from "shiki/langs/yaml.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";

import { type LineData, type Segment, Shiki_Client } from "./Shiki_Client";

// Dual theme: shiki emits per-token `--shiki-light`/`--shiki-dark` CSS variables (defaultColor: false)
// instead of baking one theme's colors inline, so code blocks follow the app's [data-theme] switch.
// The variable → color wiring lives in ./styles.css.
const loadedLangs = ["typescript", "tsx", "bash", "yaml", "json", "markdown"] as const;
//? sync, so a block renders in the response: filled in after hydration, it pushed a fragment URL's target away
const highlighter = createHighlighterCoreSync({
  themes: [githubLight, githubDark],
  langs: [typescript, tsx, bash, yaml, json, markdown],
  engine: createJavaScriptRegexEngine(),
});

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

//? a `$` only where a command starts: not on blank lines, comments, or the lines a trailing `\` continues
const bashPromptLines = (code: string) => {
  const lines = code.split("\n");
  return new Set(
    lines
      .map((line, idx) => ({
        text: line.trim(),
        continued: (lines[idx - 1] ?? "").trimEnd().endsWith("\\"),
        num: idx + 1,
      }))
      .filter(({ text, continued }) => text && !text.startsWith("#") && !continued)
      .map(({ num }) => num),
  );
};

const transformerBashLine = (promptLines: Set<number>): ShikiTransformer => ({
  line(node, line) {
    node.children.unshift({
      type: "element",
      tagName: "span",
      properties: { class: "line-number line-prompt" },
      children: [{ type: "text", value: promptLines.has(line) ? "$" : "" }],
    });
  },
});

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

type HastNode = ReturnType<typeof highlighter.codeToHast>["children"][number];
type HastElement = Extract<HastNode, { type: "element" }>;

const isElement = (node: { type: string }): node is HastElement => node.type === "element";

const classOf = (node: HastElement) => {
  const value = node.properties.class;
  return Array.isArray(value) ? value.join(" ") : String(value ?? "");
};

const isLineInFocus = (lineNum: number, ranges: [number, number][]) =>
  ranges.some(([start, end]) => lineNum >= start && lineNum <= end);

const segmentsOf = (lines: LineData[], focusLines: [number, number][] | undefined): Segment[] => {
  if (!focusLines?.length) return [{ type: "visible", lines, startLine: 1 }];
  const segments: Segment[] = [];
  for (const line of lines) {
    const type = isLineInFocus(line.lineNum, focusLines) ? "visible" : "hidden";
    const current = segments.at(-1);
    if (current?.type === type) current.lines.push(line);
    else segments.push({ type, lines: [line], startLine: line.lineNum });
  }
  return segments;
};

interface RawProps {
  className?: string;
  language?: BundledLanguage;
  code: string;
  showLineNumbers?: boolean;
}

export const Raw = ({ className, language = "typescript", code, showLineNumbers = true }: RawProps) => {
  const { cleanedCode, focusLines } = parseCollapseAnnotations(code);
  //? shiki throws on a grammar it was not loaded with, which used to render an empty block
  const lang = (loadedLangs as readonly string[]).includes(language) ? language : "text";
  const hast = highlighter.codeToHast(cleanedCode, {
    lang,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
    transformers: [
      transformerNotationDiff({
        matchAlgorithm: "v3",
        classLineAdd: "code-diff code-add select-text",
        classLineRemove: "code-diff code-remove select-text",
      }),
      transformerNotationHighlight(),
      transformerLineData,
      ...(showLineNumbers
        ? language === "bash"
          ? [transformerBashLine(bashPromptLines(cleanedCode))]
          : [transformerLineNumbers]
        : []),
    ],
  });
  const pre = hast.children.find(isElement);
  const codeElement = pre?.children.find(isElement);
  const lines: LineData[] = (codeElement?.children ?? []).filter(isElement).map((line) => ({
    lineNum: Number(line.properties["data-line"]),
    html: hastToHtml(line.children),
    className: classOf(line),
  }));
  return (
    <Shiki_Client
      className={cn("w-max", className)}
      preClass={pre ? classOf(pre) : ""}
      codeClass={codeElement ? classOf(codeElement) : ""}
      segments={segmentsOf(lines, focusLines)}
    />
  );
};
