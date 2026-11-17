import type { AppInfo, LibInfo } from "akanjs";

const handsOver = (scanInfo: AppInfo | LibInfo, model: string): boolean =>
  !!scanInfo.database.get(model)?.has("signal") ||
  [...scanInfo.getLibInfos().values()].some((libInfo) => handsOver(libInfo, model));

//? No piece is imported here: a bundle holding the whole runtime reads this file too (`ModelReference` adds them).
//? The export is not named after the model: one named `useCase` reads as a hook, which no flight row may name.
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { [key: string]: string } = {}) {
  if (scanInfo?.type !== "app" || !handsOver(scanInfo, dict.model)) return null;
  return `
"use client";

export const reference = "${dict.model}";
`;
}
