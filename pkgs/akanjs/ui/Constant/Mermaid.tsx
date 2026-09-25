"use client";

import { clsx } from "akanjs/client";
import { useEffect, useId, useRef, useState } from "react";

export interface MermaidProps {
  chart: string;
  title?: string;
  className?: string;
  highlightNodes?: string[];
  onSelectNode?: (nodeId: string) => void;
}

const lightThemeFallback = {
  base100: "#ffffff",
  base200: "#f5f5f5",
  base300: "#d4d4d4",
  baseContent: "#1f2937",
  primary: "#3b82f6",
};

const darkThemeFallback = {
  base100: "#1f2937",
  base200: "#111827",
  base300: "#374151",
  baseContent: "#f9fafb",
  primary: "#60a5fa",
};

export const Mermaid = ({ chart, title, className, highlightNodes = [], onSelectNode }: MermaidProps) => {
  const reactId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        const colors = getThemeColors();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            background: colors.base100,
            mainBkg: colors.base100,
            primaryColor: colors.base100,
            primaryTextColor: colors.baseContent,
            primaryBorderColor: colors.baseContent,
            lineColor: colors.baseContent,
            secondaryColor: colors.base200,
            tertiaryColor: colors.base300,
          },
        });
        const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
        const result = await mermaid.render(id, chart.trim());
        if (cancelled) return;
        const parsed = new DOMParser().parseFromString(result.svg, "text/html");
        const svg = parsed.querySelector("svg");
        if (!svg) throw new Error("Mermaid did not return an SVG.");
        applyHighlights(svg, highlightNodes, colors.primary);
        applyNodeSelection(svg, onSelectNode);
        const container = containerRef.current;
        if (container) container.replaceChildren(document.importNode(svg, true));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        containerRef.current?.replaceChildren();
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void render();
    const observer = new MutationObserver(() => void render());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [chart, highlightNodes, onSelectNode, reactId]);

  return (
    <div className={clsx("my-4 overflow-hidden rounded-xl border border-base-300 bg-base-200/40", className)}>
      {title ? (
        <div className="border-base-300 border-b px-4 py-2 font-bold text-base-content/70 text-sm">{title}</div>
      ) : null}
      <div className="overflow-x-auto p-4">
        {error ? (
          <pre className="whitespace-pre-wrap text-error text-sm">{error}</pre>
        ) : (
          <div ref={containerRef} className="min-w-fit text-base-content" />
        )}
      </div>
    </div>
  );
};

function getThemeColors() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const fallback = isDarkTheme(root) ? darkThemeFallback : lightThemeFallback;

  return {
    base100: getMermaidColor(style, "--color-base-100", fallback.base100),
    base200: getMermaidColor(style, "--color-base-200", fallback.base200),
    base300: getMermaidColor(style, "--color-base-300", fallback.base300),
    baseContent: getMermaidColor(style, "--color-base-content", fallback.baseContent),
    primary: getMermaidColor(style, "--color-primary", fallback.primary),
  };
}

function getMermaidColor(style: CSSStyleDeclaration, token: string, fallback: string): string {
  const color = style.getPropertyValue(token).trim();
  if (!color) return fallback;
  return isMermaidColor(color) ? color : fallback;
}

function isMermaidColor(color: string): boolean {
  return /^(#[\da-f]{3,8}|rgba?\(|hsla?\(|[a-z]+$)/i.test(color);
}

function isDarkTheme(root: HTMLElement): boolean {
  return root.dataset.theme === "dark" || root.classList.contains("dark");
}

function applyHighlights(svg: Element, nodeIds: string[], color: string): void {
  if (nodeIds.length === 0) return;
  const ids = new Set(nodeIds);
  for (const node of svg.querySelectorAll<SVGGElement>(".node")) {
    const id = getMermaidNodeId(node);
    if (!ids.has(id)) continue;
    node.querySelectorAll<SVGElement>("rect, circle, ellipse, polygon, path").forEach((shape) => {
      shape.setAttribute("stroke", color);
      shape.setAttribute("stroke-width", "3px");
    });
  }
}

function applyNodeSelection(svg: Element, onSelectNode?: (nodeId: string) => void): void {
  if (!onSelectNode) return;
  for (const node of svg.querySelectorAll<SVGGElement>(".node")) {
    node.style.cursor = "pointer";
    node.addEventListener("click", () => onSelectNode(getMermaidNodeId(node)));
  }
}

function getMermaidNodeId(node: SVGGElement): string {
  return node.id.replace(/^flowchart-/, "").replace(/-\d+$/, "");
}
