import type { CSSProperties } from "react";

const presentationKeys = new Set([
  "fill",
  "fillOpacity",
  "opacity",
  "stroke",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeLinecap",
  "strokeLinejoin",
  "strokeOpacity",
  "strokeWidth",
]);

export const pigeonSvgAttributes = (style?: CSSProperties) => {
  if (!style) return undefined;
  const entries = Object.entries(style).filter(([, value]) => value !== undefined);
  const attributes = Object.fromEntries(entries.filter(([key]) => presentationKeys.has(key)));
  const rest = Object.fromEntries(entries.filter(([key]) => !presentationKeys.has(key)));
  return Object.keys(rest).length > 0 ? { ...attributes, style: rest } : attributes;
};
