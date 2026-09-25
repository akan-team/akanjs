import "./styles.css";

import { clsx } from "akanjs/client";
import type { BundledLanguage, BundledTheme } from "shiki";

import { CodeView } from "./CodeView";
import { Raw } from "./Raw";

interface SnippetProps {
  className?: string;
  code: string;
  language?: BundledLanguage;
  title?: string;
  copy?: boolean;
  theme?: BundledTheme;
  showLineNumbers?: boolean;
  wrapperClassName?: string;
}

export const Snippet = ({
  className,
  code,
  language = "typescript",
  title,
  copy = true,
  theme,
  showLineNumbers = true,
  wrapperClassName,
}: SnippetProps) => {
  const trimmedCode = code.trim();
  const copyText = getCopyText(trimmedCode);
  const lastCode = trimmedCode.slice(-10);
  return (
    <CodeView
      className={clsx("my-3 w-fit", className)}
      key={`${title}-${lastCode}`}
      title={title}
      wrapperClassName={wrapperClassName}
      copyText={copy ? copyText : undefined}
    >
      <Raw className="p-2" language={language} theme={theme} code={trimmedCode} showLineNumbers={showLineNumbers} />
    </CodeView>
  );
};

function getCopyText(trimmedCode: string): string {
  const lines = trimmedCode.split("\n");
  const result: string[] = [];
  let skipCount = 0;
  for (const line of lines) {
    if (skipCount > 0) {
      skipCount--;
      continue;
    }
    const multiDeleteMatch = /\/\/\s*\[!code\s+--:(\d+)\]/.exec(line);
    if (multiDeleteMatch) {
      skipCount = parseInt(multiDeleteMatch[1], 10) - 1;
      continue;
    }
    if (/\/\/\s*\[!code\s+--\]/.test(line)) continue;
    if (/^\s*#/.test(line)) continue;
    result.push(line.replace(/\s*\/\/\s*\[!code[^\]]*\]/g, ""));
  }
  return result.join("\n");
}
