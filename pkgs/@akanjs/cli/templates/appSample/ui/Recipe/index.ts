import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "index.ts",
    content: `export { type JellyButtonVariants, jellyButtonRecipe } from "./jellyButton";
`,
  };
}
