import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict, options: { libs: string[] }) {
  const isUsingShared = options.libs.includes("shared");
  return {
    filename: "layout.tsx",
    content: `
import "./styles.css";
import { RootLayoutProps } from "@akanjs/client";
import { System } from "@akanjs/ui";
import { env } from "@${dict.appName}/env/env.client";
import { fetch } from "@${dict.appName}/client";
${isUsingShared ? "import { Auth } from '@shared/ui';" : ""}

export const metadata = { title: "${dict.appName}" };

export default function Layout({ children, params }: RootLayoutProps) {
  return (
    <System.Provider
      of={Layout}
      appName="${dict.appName}"
      params={params}
      head={<link rel="icon" href="/favicon.ico" />}
      // className="bg-base-100"
      env={env}
    >
      {children}${isUsingShared ? "\n      <Auth.User />\n      <Auth.Admin />" : ""}
    </System.Provider>
  );
}
  `,
  };
}
