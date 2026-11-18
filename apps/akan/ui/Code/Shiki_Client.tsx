"use client";
import { useState } from "react";
import { GoFold, GoUnfold } from "react-icons/go";

export interface LineData {
  lineNum: number;
  html: string;
  className: string;
}

export interface Segment {
  type: "visible" | "hidden";
  lines: LineData[];
  startLine: number;
}

interface Shiki_ClientProps {
  className?: string;
  preClass: string;
  codeClass: string;
  segments: Segment[];
}

interface CollapsedSectionProps {
  sectionId: string;
  startLine: number;
  endLine: number;
  lines: LineData[];
  isExpanded: boolean;
  onToggle: () => void;
}

const CollapsedSection = ({ sectionId, lines, isExpanded, onToggle }: CollapsedSectionProps) => {
  return (
    <div className={`collapsed-section ${isExpanded ? "expanded" : ""}`} data-section={sectionId}>
      <button className="expand-btn" onClick={onToggle}>
        <span className="expand-icon">{isExpanded ? <GoFold size={12} /> : <GoUnfold size={12} />}</span>
      </button>
      <div className="collapsed-lines opacity-30">
        {lines.map((line) => (
          <span
            key={line.lineNum}
            className={line.className}
            data-line={line.lineNum}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <HTML 코드를 직접 설정>
            dangerouslySetInnerHTML={{ __html: line.html }}
          />
        ))}
      </div>
    </div>
  );
};

export const Shiki_Client = ({ className, preClass, codeClass, segments }: Shiki_ClientProps) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div className={className}>
      <pre className={preClass}>
        <code className={codeClass}>
          {segments.map((segment, index) => {
            if (segment.type === "visible") {
              return segment.lines.map((line) => (
                <span
                  key={line.lineNum}
                  className={line.className}
                  data-line={line.lineNum}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: <HTML 코드를 직접 설정>
                  dangerouslySetInnerHTML={{ __html: line.html }}
                />
              ));
            } else {
              const sectionId = `section-${index}`;
              const isExpanded = expandedSections.has(sectionId);
              const endLine = segment.startLine + segment.lines.length - 1;

              return (
                <CollapsedSection
                  key={sectionId}
                  sectionId={sectionId}
                  startLine={segment.startLine}
                  endLine={endLine}
                  lines={segment.lines}
                  isExpanded={isExpanded}
                  onToggle={() => {
                    toggleSection(sectionId);
                  }}
                />
              );
            }
          })}
        </code>
      </pre>
    </div>
  );
};
