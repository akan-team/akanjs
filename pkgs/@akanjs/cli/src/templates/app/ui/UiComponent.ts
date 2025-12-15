import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "UiComponent.tsx",
    content: `
// This is a Sample UI component that can be used in the app.
// You can use it by \`import { UiComponent } from "@${dict.appName}/ui";\` in the page or other components.
// File name and export name should be same, because of modularizedImport feature of Next.js.

export const UiComponent = () => {
  return <div>UiComponent</div>;
};
  `,
  };
}
