import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "_overrides.tsx",
    content: `import { jellyButtonRecipe } from "@apps/${dict.appName}/ui";
import { override } from "akanjs/ui";

export default override({ recipes: { button: jellyButtonRecipe } });
`,
  };
}
